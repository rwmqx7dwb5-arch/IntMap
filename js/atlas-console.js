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
import { attachLightbox, atlFmtBytes, ATL_FILE } from './atlas-attach.js';   /* (#R232) attachments + the full-screen viewer; (#R540) ATL_FILE asks the BYTES what a file is */
import { ATTACH_STORE, attachViewStrings, ATTACH_LOG } from './atlas-file-view.js';   /* (#R773) 添付を見せる側（記録の預かり所とビューアの文）と、会話 1 本ぶんの台帳 ATTACH_LOG（実体は js/atlas-attach-log.js。ここを 1 行に束ねているのは、この中心部に import 1 行の余白も無いから） */   /* (#R232) attachments + the full-screen viewer; (#R540) ATL_FILE asks the BYTES what a file is */
import { makeAtlasReading } from './atlas-reading.js';   /* (#R776) arriving on the thing being read: the bubble both «Ask Atlas» buttons land on. ⚠ A LINE OF ITS OWN, unlike the gloss beside it — scripts/js-reachability.mjs only sees an import at the START of a line, so a module co-located behind another import is invisible to the reachability rule and check:static calls it dead. */
import { makeMsgTools } from './atlas-msg-tools.js';   /* (#R298) the per-message tool bar + the in-place editor */   import { makeAtlasGloss } from './atlas-gloss.js';   /* (#R491) select a phrase in a reply → a dictionary card for it. ⚠ ON THIS LINE because the kernel has no headroom (tests/atlas-capabilities-checks.test.mjs #R318 ⑨b) and a feature moves out, never the ceiling up */
import { atlasPanelCSS } from './atlas-styles.js';   /* (#R313) the panel's stylesheet — moved out so this file stays under a ceiling that is never raised */
import { makeAtlasGeoResolve } from './atlas-geo-resolve.js';
import { makeAtlasControls } from './atlas-controls.js';
import { makeAtlasSources } from './atlas-sources.js';
import { ATLAS_BUDGETS, settleWithin, makeFetchJSON, newTurnController } from './atlas-deadlines.js';   /* (#R452) the turn's clocks — Atlas had two private, unbounded copies of the relay ladder */
import { makeAtlasSims } from './atlas-sims.js';
import { peekOwnRelay } from './proxy-fetch.js';   /* the self-diagnosis asks OUR relay what the upstream last said, instead of asking the upstream (see _PROBES) */
import { makeAtlasVerify } from './atlas-verify.js';
import { makeAtlasCapabilities } from './atlas-capabilities.js';   /* (#R318) normally js/app-body.js has already built the registry at boot; this is the fallback for a boot that did not get that far, so Atlas is never the thing that has no capabilities */
import { installAtlasKernel } from './atlas-executor.js';   /* (#R318) the executor, the result shape and the state ledger — fetched WITH Atlas rather than at boot; installAtlasKernel is idempotent so a UI button may have mounted it first */
import { makeAtlasAgent } from './atlas-agent.js';   /* (#R406) the turn loop \u2014 Atlas chooses, IntMap executes, Atlas answers last */
import { makeEraHighlight } from './atlas-era-highlight.js';
import { makeHighlightTargets } from './atlas-country-ids.js';   /* (#R742) every ISO notation the border store declares */   /* (#R726) the map's year applied to a country highlight */
import { makeAtlasMetrics } from './atlas-metrics.js';
import { makeAtlasToolSurface } from './atlas-toolsurface.js';   /* (#R406) a few typed tools + discovery, instead of 64 kB of catalogue */
import { makeViewCapture } from './atlas-view-capture.js';   /* (#R493) view.inspect — the SAME picture the screenshot button takes, plus the per-turn frame ledger. The subject lives THERE because this file is shrink-only (tests/atlas-turn-checks.test.mjs #R419 ⑨d) */
import { makeAtlasSchemas } from './atlas-schemas.js';   /* (#R406) the per-capability argument schemas the registry never had */
import { makeAtlasCatalogText } from './atlas-catalog-text.js';   /* (#R318) the 58 kB action catalogue that used to be inline in SYS() */
import { makeAtlasAnswerPipeline } from './atlas-answer-pipeline.js';   /* (#R350/#R472) the analysis answer as a contract: evidence registry -> ONE call -> audit -> report. The audit no longer re-asks or rewrites the answer. */
import { makeAtlasAnswerRender } from './atlas-answer-render.js';   /* (#R350) every link on screen is built from the registry, never from the model's prose */
import { makeAtlasEvidence } from './atlas-evidence.js';
import { makeAtlasAnswerContract } from './atlas-answer-contract.js';
import { makeAtlasAnswerAudit } from './atlas-answer-audit.js';
import { makeAtlasExamples } from './atlas-examples.js';   /* (#R309) the starter chips — see the ceiling note there */
import { makeNewsCluster } from './news-cluster.js';   /* (#R340) research.events — the ONE deterministic article→event grouper, with the measurements behind every constant */
import { makeAtlasGeoObject } from './atlas-geo-object.js';   /* (#R397) one shape for a place, and WHERE its coordinate came from — so a coordinate IntMap already fetched stops being thrown away and re-geocoded */
import { makeAtlasPolicy } from './atlas-policy.js';
import { makeAtlasTurnContinuity } from './atlas-turn-continuity.js';   /* (#R419) what a turn leaves behind when it ends early: the question in the record, and a Stopped note that does not erase the page. ⚠ ON THIS LINE because js/atlas-console.js is AT its shrink-only ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ) — the same reason #R278 appended inside a line. */
import { makeAtlasTurnResults } from './atlas-turn-results.js';   /* (#R441) one operation, one block in the reply: the de-dupe that used to compare rendered HTML and lost to routing's per-set `data-rset` nonce */ import { NominatimGate } from './nominatim-gate.js';   /* ⚠ (#R489) TWO IMPORTS ON THIS LINE because js/atlas-console.js is AT its shrink-only ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ) — the same reason #R419 appended here. The two below need lines of their own: scripts/js-reachability.mjs anchors its import scan at the START of a line, so a module named second on a shared line reads as one nothing imports. The room came from deleting this file's own private Nominatim floor (see `_fetchUnitPoly`). */
import { makeAtlasGeoLedger } from './atlas-geo-ledger.js';   /* (#R489) the places this conversation has resolved, kept as data instead of as 26 characters of action label */
import { makeAtlasAdmin1 } from './atlas-admin1.js';   /* (#R489) first-level boundaries out of the file we already ship, so fourteen oblasts cost ONE request between them */
import { makeAtlasAnomalyScore } from './atlas-anomaly-score.js';   /* (#R397) one scale for an earthquake, a typhoon and a flood — see that file for why the old bias was a SAMPLING artefact */   /* (#R397) source precedence, map restraint, coordinate provenance — prompt prose, out of the shell's line ceiling (tests/atlas-console-kernel-checks.test.mjs #R199 ⑤) */   import { everyTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */   /* ⚠ (#R495) ON THIS LINE because js/atlas-console.js is AT its shrink-only ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ) and this round adds a dispatch case. js/runtime.js is imported at line-start by 31 other modules, so scripts/js-reachability.mjs still sees it — the exact test #R489 applied before sharing a line. */
import { makeAtlasProgress } from './atlas-progress.js';   /* (#R723) the work trace — what Atlas is doing, as a list that keeps what already happened. ⚠ ITS OWN LINE, and the room for it came from DELETING the fifteen lines the one-word indicator occupied here: this file is at a shrink-only ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ) and the subject that leaves is the one being replaced. */
import { CAPABILITY_MODULES } from './atlas-caps-modules.js';   /* (atlas-capability-modules) every capability: its row, its schema and what the dispatch runs for it */
import { capabilityRunners, unknownAction } from './atlas-caps.js';
import { makeAtlasMapCompose } from './atlas-map-compose.js';   /* (#R511) one map explanation in ONE call — numbered places with roles, arcs, fills, a frame and a legend the prose is linked to. ⚠ ON A LINE THAT WAS BLANK: this file is AT its shrink-only ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ), and scripts/js-reachability.mjs anchors its import scan at line start, so a new module cannot share a line. */
window.IntMapModules=window.IntMapModules||{};
const CAP_RUN = capabilityRunners(CAPABILITY_MODULES);   /* dispatch spelling → run, derived once from the entries (js/atlas-caps.js) */
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
  const _aiLangName=HOST._aiLangName, addEdgeResize=HOST.addEdgeResize, addPin=HOST.addPin, aiGate=HOST.aiGate, aiLimitMsg=HOST.aiLimitMsg, aiLoginMsg=HOST.aiLoginMsg, aiParseJSON=HOST.aiParseJSON, aiQuotaBlocked=HOST.aiQuotaBlocked, aiToast=HOST.aiToast, aiToday=HOST.aiToday, aiUsage=HOST.aiUsage, aiUsesLeft=HOST.aiUsesLeft, applyAccent=HOST.applyAccent, applyTheme=HOST.applyTheme, askAI=HOST.askAI, askAIJSON=HOST.askAIJSON, askAIJSONEnvelope=HOST.askAIJSONEnvelope, bringToFront=HOST.bringToFront, cName=HOST.cName, clearAllPins=HOST.clearAllPins, compressImage=HOST.compressImage, countryStats=HOST.countryStats, diskFillPolys=HOST.diskFillPolys, exitTool=HOST.exitTool, fetchData=HOST.fetchData, fmtPc=HOST.fmtPc, loadCountryData=HOST.loadCountryData, localFuzzyPlaces=HOST.localFuzzyPlaces, makeDraggable=HOST.makeDraggable, parseDate=HOST.parseDate, refreshTool=HOST.refreshTool, saveSettings=HOST.saveSettings, setGrid=HOST.setGrid, setLang=HOST.setLang, setMode=HOST.setMode, setTool=HOST.setTool, showCountryDetail=HOST.showCountryDetail, t=HOST.t, updateToolPanel=HOST.updateToolPanel, ymdISO=HOST.ymdISO;
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
    const L=window.IntMapLang.pick(()=>_mirrorLang()), LA=window.IntMapLang.pickArgs();   /* (#R241) LA = the ARRAY form; see `pickArgs` in js/lang-registry.js. ONE statement: this file is under a shrink-only ceiling (tests/atlas-console-kernel-checks.test.mjs #R199 ⑤), and the rule is that a feature moves out, never that the ceiling moves up. */
    const esc=s=>window.IntMapSafe.html(s);   /* the one encoder (js/safe-html.js); the local copy did not encode ' */
    const lx=arr=>L.arr(arr);   /* (#R241) through `pick()` itself, so a language past the arguments given gets its inline-table entry instead of English at index 0 */
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
    let _turnSeq=0, _curTurn=0, _curTurnKey='', _atlSentNames=[], _atlRecallImgs=[], _atlRecallAtts=null; const _atlTurnImgs=(frames,recalled)=>{ const a=(frames||[]).concat(recalled||[]); return a.length?a:null; };   /* ⚠⚠⚠ (#R779) `VFRAMES.urls()` は空のとき null を返す契約（その理由は js/atlas-view-capture.js の urls() に書いてある）。#R773 がここに .concat を足したとき契約が一緒に運ばれず、inspect を通らない普通の初回送信が毎回 null.concat で死んだ。空なら null のまま返す——[] は「画像が無い」ではなく「空の一覧を送る」になる */
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
    /* (#R406) The last plausible past year written in an era string — «World War I 1916», «1750».
       ⚠ THIS IS SYNTAX, NOT MEANING, and that is why it survived the round that deleted the request
       profile it used to live in: it reads a four-digit number out of a value ATLAS ALREADY CHOSE as
       the era of a historical map, so that a follow-up question inherits the year. It never looks at
       the reader's sentence and it decides nothing about what was asked. */
    function _eraYear(s){ s=String(s||''); let best=null; const yNow=(new Date()).getFullYear();
      const re=/(?:^|[^0-9.,])((?:1[0-9]|20)[0-9]{2})\s*(?:年|CE|AD|BCE?)?/g; let m;
      while((m=re.exec(s))){ const y=+m[1]; if(y>=1000&&y<=yNow) best=y; } return best; }
    function updateWctx(acts,fails){ try{ (acts||[]).forEach(a=>{ if(!a||(fails||[]).indexOf(a)>=0) return; const t=CAPS.dispatchName(a.type);   /* (atlas-one-declaration) the case label, so every spelling the capability's row declares counts — these lines used to list some of them and miss others (`historical`, `reportMap`, `synthesize`) */
      if(t==='compareStats'&&a.countries) _wctx.countries=[].concat(a.countries).map(String).slice(0,10);
      if(t==='analyze'&&(a.question||a.query)) _wctx.topic=String(a.question||a.query).slice(0,140);
      if(t==='mapReport'&&a.topic) _wctx.topic=String(a.topic).slice(0,140);
      if(t==='impact') _wctx.topic=('impact: '+String(a.place||a.event||'')).slice(0,140);
      if((t==='rank'||t==='mapMetric'||t==='explore')&&a.metric){ const m2=String(a.metric); if(_wctx.metrics.indexOf(m2)<0) _wctx.metrics.unshift(m2); _wctx.metrics=_wctx.metrics.slice(0,4); }
      if(t==='scoreMap'&&Array.isArray(a.components)){ try{ _wctx.scoreComponents=JSON.stringify({name:a.name||'',components:a.components}).slice(0,600); }catch(_){} }
      if(t==='reset'||t==='clearAll'){ _wctx.scoreComponents=null; }
      if(t==='timeTravel'){ _wctx.period=(a.reset||a.now||a.live)?'now':String(a.year||a.date||((a.daysAgo!=null)?(a.daysAgo+' days ago'):'')).slice(0,40);
        if(a.reset||a.now||a.live) _wctx.year=null; else if(a.year!=null&&isFinite(+a.year)) _wctx.year=Math.round(+a.year); else if(a.date){ try{ const y=+String(a.date).slice(0,4); if(y>=1000) _wctx.year=y; }catch(_){} } }   /* (#R135) year for the next turn's REQUEST PROFILE (conversation fallback) */
      if(t==='researchMap'&&a.year!=null&&isFinite(+a.year)) _wctx.year=Math.round(+a.year);   /* (#R135) */
      if(t==='historicalMap'&&(a.era||a.date)){ try{ const y=_eraYear(String(a.era||a.date)); if(y!=null) _wctx.year=y; }catch(_){} }   /* (#R135) */
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
    function clearHl(){ _hl.forEach(c=>{ try{ GE().layers.setFeatureState({source:'nlq-src',id:c},{nlq:false}); }catch(_){} }); _hl=new Set(); _eraHl=[]; try{ _wctx.highlight=null; }catch(_){}   /* ⚠⚠⚠ (#R802) THE NAME OUTLIVED THE PAINT. `_hl` empties here, but the LAST highlight's name lived on in `_wctx.highlight`, and that is what `_atlasOverlayState()` and the prompt line above report — so the state kept telling Atlas a highlight was on the map after it had been cleared. Measured on production 2026-09-18: five turns in a row opened by clearing 「the previous Syria highlight」, each spending a step on a map that held nothing (.agents/rules/one-pass-or-a-reason.md §2-1 — the observer lied). It is forgotten HERE, in the one function that empties the set, so every clearing path gets it: `reset`, `clearAll`, `highlight {on:false}`, and the clears each painting path opens with (those set it again from their own paint a few lines later). */ try{ if(GE().layers.hasSource('nlq-era-src')) GE().layers.setSourceData('nlq-era-src',{type:'FeatureCollection',features:[]}); }catch(_){} } let _eraHl=[]; const _ERA=makeEraHighlight({GE, resolveCountrySync:(n)=>resolveCountrySync(n)}); const _eraGeomsFor=(code)=>_ERA.eraGeomsFor(code); const ensureEraHlLayers=()=>_ERA.ensureEraHlLayers({fill:_hlColor,line:_hlLineColor}); const _eraActive=()=>{ try{ const TB=window.IntMapTimeBorders; return !!(TB&&TB.active&&TB.active()); }catch(_){ return false; } };   /* (#R736) is the era record the one on screen? asked of the record itself, never inferred from the clock */ const _eraBox=(c)=>_ERA.eraBoxFor(c);
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
      /* ⚠⚠⚠ (#R736) …AND IT ASKED ONE RECORD WHILE THE MAP DREW THE OTHER: `valid` is the MODERN geojson, so the loop below used to `return` on a code it lacks BEFORE
         consulting `_eraGeomsFor` — a polity only the era record holds was unpaintable exactly while it WAS the map. Era first, then modern; `_eraGeomsFor` is null at the live date. DEV-NOTES #R736 §2. */
      if(!valid.size&&!_eraActive()) return false;
      let any=false; const eraFeats=[]; codes.forEach(c=>{ const cs=String(c);
        const era=_eraGeomsFor(cs); if(era){ era.forEach(e=>eraFeats.push({type:'Feature',geometry:e.geo,properties:{code:cs,name:e.name}})); _hl.add(cs); any=true; return; }   /* the map's year applies to areas: that year's polity, not the modern polygon */
        if(!valid.has(cs)) return;   /* neither record holds a shape for this code → skip; don't claim an impossible paint */
        try{ GE().layers.setFeatureState({source:'nlq-src',id:cs},{nlq:true}); _hl.add(cs); any=true; }catch(_){} }); if(eraFeats.length&&ensureEraHlLayers()){ try{ GE().layers.setSourceData('nlq-era-src',{type:'FeatureCollection',features:eraFeats}); _eraHl=eraFeats.map(f=>f.properties.name); }catch(_){} }
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
    window._imAtlasPaint=_ERA.paintState({countries:()=>_hl, era:()=>_eraHl, polys:()=>_hlPolys, lines:()=>_hlLines, choro:()=>_choroState, metric:()=>_choroMetric, poi:()=>_pois, /* (#R802) the markers are a painted surface too — read at OBSERVATION time like every other getter here, so a declaration is held against what the map holds THEN */ outline:()=>{ try{ const c=window.IntMapOutline&&window.IntMapOutline.current&&window.IntMapOutline.current(); return (c&&c.name)||null; }catch(_){ return null; } }});   /* (#R760) the place outline paints its own source, so no count here moves when the same place is outlined twice */   /* (#R736) what Atlas has painted, declared beside the state that paints it — reasoning in js/atlas-era-highlight.js, reader is js/atlas-capabilities.js `paintNow()` */
    /* ⚠⚠⚠ (#R747) THE OTHER HALF OF #R742's DECLARATION — WHAT A CLEAR TOOK OFF. A painter that took things
       off had nothing to point at, so it fell to `paint.verify`'s last line — `not_rendered`, i.e. failed — and
       Atlas cleared again (measured: 「Clear everything from the map」 ended `repeated_calls` in 36 s while the
       map was in fact clear). `_CLEARED(...)` names the surfaces that are now to be EMPTY, in `_imAtlasPaint`'s
       own vocabulary, and js/atlas-capabilities.js verifies emptiness exactly as it verifies presence. Read, not trusted. */
    const _CLEARED=(...kinds)=>{ const d={}; kinds.forEach(k=>{ d[k]=[]; }); return {meta:{painted:d}}; };   /* (#R747) the surfaces a clear declares EMPTY, in the same vocabulary — js/atlas-capabilities.js PAINT_GOAL reads it */   const _PINNED=(x,drew)=>{ const n=(drew===false)?[]:_pois.map(p=>(p&&p.name)?String(p.name):'').filter(Boolean); if(!n.length) return x||null; return Object.assign({},x||null,{meta:Object.assign({},(x&&x.meta)||null,{painted:Object.assign({poi:n},(x&&x.meta&&x.meta.painted)||null)})}); };   /* ⚠⚠⚠ (#R802) THE SAME DECLARATION FOR THE FIVE CAPABILITIES THAT PIN — reasoning and the production measurement sit beside `PAINTED_IDS.poi` in js/atlas-era-highlight.js; two rules live here. ⚠ NOTHING IS DECLARED WHEN NOTHING IS NAMED: `PAINT_GOAL` reads an empty list as 「this surface is to be EMPTY」 (#R747), so a painter holding only nameless pins would be claiming the map should be bare — it declares no `poi` at all and falls back to the cardinal reading, which is the honest default (.agents/rules/no-ad-hoc-hardcoding.md: never guess what was not observed). ⚠ AND `drew===false` MEANS THE PAINT ITSELF FAILED, so pins this turn already had are never passed off as this call's work. */
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
      try{ await NominatimGate.nominatimSlot(); const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&polygon_geojson=1&polygon_threshold=0.0008&namedetails=1&q='+encodeURIComponent(nm),{headers:{Accept:'application/json'}});   /* (#R489) …behind the app's one floor — js/nominatim-gate.js */
        if(r.ok){ const j=await r.json();
          if(Array.isArray(j)){ const wat=j.filter(o=>{ const c=(o.class||o.category||'').toLowerCase(); const gt=(o.geojson&&o.geojson.type)||''; return (c==='waterway'||/^(river|canal|stream)$/.test(String(o.type||'').toLowerCase()))&&/LineString/.test(gt); })
            .sort((x,y)=>((+y.importance||0)-(+x.importance||0)))[0];
            if(wat) out={geo:wat.geojson,name:(wat.display_name||nm).split(',')[0],nameEn:(wat.namedetails&&(wat.namedetails['name:en']||wat.namedetails.int_name))||''}; } } }catch(_){}
      if(!out){ try{ const ll=await geocode(nm); if(ll&&isFinite(ll.lng)){ const d2=3.2; const bb='('+(ll.lat-d2).toFixed(2)+','+(ll.lng-d2).toFixed(2)+','+(ll.lat+d2).toFixed(2)+','+(ll.lng+d2).toFixed(2)+')';
        const safe=String(nm).replace(/["\\]/g,'').trim();
        const q2='[out:json][timeout:30];way["waterway"~"^(river|canal|stream)$"]["name"~"'+safe+'",i]'+bb+';out geom 300;';
        const j2=await overpassRaw(q2).catch(()=>null);
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
      return await overpassRaw(q2).then(x=>x.elements,()=>null); }
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
    let _hlGen=0;   /* (#R143) generation token — a slow async resolution can't overwrite a newer highlight (古い処理の遅延上書き対策) */ let _hlRun=null, _poiRun=null; const _hlAdd=(a)=>{ const g=(a&&a.__paintRun)||null; const s=(g!=null&&_hlRun===g); _hlRun=g; return s; }; const _poiAdd=(a)=>{ const g=(a&&a.__paintRun)||null; const s=(g!=null&&_poiRun===g); _poiRun=g; return s; };   /* ⚠⚠ (#R489) A SECOND HIGHLIGHT IN THE SAME TURN USED TO ERASE THE FIRST. Every painting path below opens with clearHl()/clearPolyHl(), which is right when a NEW request arrives and wrong when one request draws fourteen oblasts as fourteen actions: each ran, each reported 「地図に表示中」, and the map ended up holding the last one. #R143's generation token is about a STALE async paint overwriting a NEWER one and it stays exactly as it was; this is about two paints that BOTH belong to the turn the reader is waiting on. `_runGen` is the run token this console already bumps for every user-visible operation — a turn (three call sites), a `runDirect` from another feature, and a press of Stop — so «the same request» is a fact the console holds rather than a guess. ⚠ IT IS NOT `_curTurn`: that one only moves in `run()`, so two presses of an area-summary button (which go through `runDirect`) would have read as one request and piled up for ever. ⚠ IT ADDS NOTHING TO WHAT ATLAS MAY DO (CONSTITUTION.md §5) — no cap, no refusal; the map simply keeps what this turn drew, which is what the reply already claimed. The POI half is the same sentence about pins: mapReport, researchMap and the answer-place pinner each called clearPois() first, so a turn that researched and then mapped showed one of the two. */
    /* ⚠⚠ (#R489) A SECOND HIGHLIGHT IN THE SAME TURN USED TO ERASE THE FIRST. Every painting path below opens with clearHl()/clearPolyHl(), which is right when a NEW request arrives and wrong when one request draws fourteen oblasts as fourteen actions: each ran, each reported 「地図に表示中」, and the map ended up holding the last one. #R143's generation token is about a STALE async paint overwriting a NEWER one and it stays exactly as it was; this is about two paints that BOTH belong to the turn the reader is waiting on. `_curTurn` is the monotone turn id #R298 already stamps on every bubble, so «same request» is a fact the console holds rather than a guess. ⚠ IT ADDS NOTHING TO WHAT ATLAS MAY DO (CONSTITUTION.md §5) — no cap, no refusal; the map simply keeps what this turn drew, which is what the reply already claimed. The POI half is the same sentence about pins: mapReport, researchMap and the answer-place pinner each called clearPois() first, so a turn that researched and then mapped showed one of the two. */
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
    /* (#R157/#R742) the highlight target reader moved WHOLE to js/atlas-country-ids.js — the
       meaning/execution split, the identifier notations and the fall-through are all documented
       there. The names below are the ones this file has always called. */
    const _HT=makeHighlightTargets({geo, resolveCountrySync:(n)=>resolveCountrySync(n)});
    const _hlIdIndex=()=>_HT.idIndex(), _hlValidCodeSet=()=>_HT.validCodeSet(), _hlReadGptGroups=(a)=>_HT.readGroups(a);
    const _hlReadNames=(a)=>_HT.readNames(a);   /* (#R747) the ONE reading of which fields carry which things — see js/atlas-country-ids.js REQUEST_FIELDS */
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
    /* Nominatim allows ~1 request/second — a burst of 30+ member-unit fetches got rate-limited and half the chernozem belt silently dropped. Transient failures are retried once and NEVER cached (only real polygons are).
       ⚠ (#R489) THIS BLOCK'S OWN 1.05 s PROMISE CHAIN IS GONE. It was the second of three private floors (js/routing-geocode.js kept a third, and the five remaining Nominatim callers kept none) — so «one request per second» was one per second EACH. js/nominatim-gate.js owns the counter now and every caller queues behind the same second. */
    async function _fetchUnitPoly(q,thr){ const key=q+'|'+thr; if(_unitPolyCache[key]!==undefined) return _unitPolyCache[key];
      for(let att=0;att<2;att++){
        await NominatimGate.nominatimSlot();
        try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&polygon_geojson=1&polygon_threshold='+thr+'&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
          if(!r.ok){ continue; } const j=await r.json();
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
      { const _a1=await ADM1.hlTarget(nm,{ledger:GLEDGER}); if(_a1){ try{ GLEDGER.record(_a1.entity); }catch(_){} return _a1; } }   /* ⚠ (#R489) THE FIRST-LEVEL ADMIN RUNG, AND IT IS LOCAL. Everything below this line leaves the machine: `_nomExtent` asks Nominatim for `polygon_geojson` and `geoVerify` asks the web. Fourteen oblasts went down that ladder once per name, plus retries, against a host whose published policy is one request per second — and 「ベルゴロド州」 still failed, because Nominatim's top hit for it is the CITY of Belgorod and the fail-closed check correctly refused a city as an oblast outline. `data/admin1-world.json.gz` has held the real outline, and its Russian and ISO names, since #R290; only js/world-packs.js could see it. Now the ladder consults it BEFORE the network, so the fourteen cost ONE request between them — and the entity is filed in the ledger so the NEXT turn does not start from a string again (js/atlas-admin1.js explains why it declines rather than guesses). ⚠ IT SITS ABOVE regionCompose, NOT BELOW IT — measured on the running app: the curated-composition rung ANSWERS 「Belgorod Oblast」 by composing it out of Nominatim member units, one gated request per name, so four oblasts took 4,285 ms and four requests with this rung underneath it and 19 ms and ZERO with it on top. A name this index does not hold still falls through to composition exactly as before. */
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
      let _gv=null,_gvTried=false; const _getGV=async()=>{ if(!_gvTried){ _gvTried=true; try{ _gv=await geoVerify(nm,{turnId:_curTurnKey}); }catch(_){ _gv=null; }   /* (#R515) inside the reader's paid turn (#R318), not a use of its own */ } return _gv; };
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
      try{ const g=geo(); if(g&&g.features&&codes&&codes.length){ const set=new Set(codes.map(String)); g.features.forEach(f=>{ if(!set.has(String(f.id))) return; const bb=_eraBox(f.id)||fbbox(f.geometry); if(!bb) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); }); } }catch(_){}
      try{ const g2=geo(); if(codes&&codes.length) codes.forEach(cd=>{ if(g2&&g2.features&&g2.features.some(f=>String(f.id)===String(cd))) return; const bb=_eraBox(cd); if(!bb) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); }); }catch(_){}   /* (#R736) e.g. OTT: only the era record has it */
      (polys||[]).forEach(p=>{ try{ const bb=fbbox(p.geo); if(!bb) return; any=true; a=Math.min(a,bb[0]);b=Math.min(b,bb[1]);c=Math.max(c,bb[2]);d=Math.max(d,bb[3]); }catch(_){} });
      return (any&&isFinite(a)&&(c-a)<350)?[[a,b],[c,d]]:null; }
    /* ---- analysis ---- */
    function rows(metric){ const _s=metSpec(metric); const m=_s&&_s.m; if(!m) return null; const out=[]; for(const code in countryStats){ const s=countryStats[code]; if(!isRankableCountry(s)) continue;   /* (#R775) Antarctica was 1st by GDP per capita */ const v=m.get(s); if(v==null||isNaN(v)) continue; out.push({code,name:nm(s),val:v}); } out.sort((x,y)=>y.val-x.val); return out; }   /* (#R105) also rank the XMET metrics (life expectancy / internet), not only the base METRICS set */
    function rank(metric,order,n){ const l=rows(metric); if(!l) return null; return order==='bottom'?l.slice(-n).reverse():l.slice(0,n); }
    function ratio(a,b,order,n){ const sa=metSpec(a),sb=metSpec(b); if(!sa||!sb) return null; const ma=sa.m,mb=sb.m;   /* (#R740) same resolver as rank/mapMetric */ const out=[]; for(const code in countryStats){ const s=countryStats[code]; if(!isRankableCountry(s)) continue; const va=ma.get(s),vb=mb.get(s); if(va==null||vb==null||isNaN(va)||isNaN(vb)||vb===0) continue; out.push({code,name:nm(s),val:va/vb}); } out.sort((x,y)=>y.val-x.val); return order==='bottom'?out.slice(-n).reverse():out.slice(0,n); }
    function relate(my,mx,find,n){ const spY=metSpec(my),spX=metSpec(mx); if(!spY||!spX) return null; const Y=spY.m,X=spX.m;   /* (#R740) same resolver as rank/mapMetric */ const pts=[]; for(const code in countryStats){ const s=countryStats[code]; if(!isRankableCountry(s)) continue; let y=Y.get(s),x=X.get(s); if(y==null||x==null||isNaN(y)||isNaN(x)) continue; if(X.log){ if(x<=0) continue; x=Math.log(x); } pts.push({code,name:nm(s),y,xv:x,raw:Y.get(s)}); }
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
    /* (#R340) ↳ js/news-cluster.js — article→EVENT grouping for research.events. No HOST and no deps: it is pure, which is what lets tests/news-cluster-checks.test.mjs (#R340) run the shipped function over a fixture. */
    const { EVENT_RULES, groupNewsEvents, newsSubject } = makeNewsCluster();
    /* (#R350) the answer contract, in the shape tests/layer-boot-graph-checks.test.mjs #R175 ③ requires of every js/ module: ONE
       exported factory per file, nothing private at a module's top level, and the API attached to
       window so the browser spec can drive the REAL renderer rather than a Node copy of it. */
    const { runStructuredAnswer, auditMeta } = makeAtlasAnswerPipeline();
    const ARENDER = makeAtlasAnswerRender(); const { renderAnswer, answerPlainText, answerCSS, citedRecords } = ARENDER;   /* (#R589) the whole surface too, because _atlCompose needs demoteProseLinks */
    const { makeEvidenceRegistry } = makeAtlasEvidence();
    const { normalizeAnswer } = makeAtlasAnswerContract();
    const GEOBJ = makeAtlasGeoObject();   /* (#R397) geoObject / placed / pointLike / describesUserPoint / mergeKnown */
    const ANOM = makeAtlasAnomalyScore();   /* (#R397) cross-domain hazard ranking with an explainable score */
    const POLICY = makeAtlasPolicy();     /* (#R406) the core instruction \u2014 one paragraph, not nine */ const TCONT = makeAtlasTurnContinuity();   /* (#R419) actionLabel / askRecords / markCancelled */
    const AGENT = makeAtlasAgent();       /* (#R406) the turn loop */
    const SCHEMAS = makeAtlasSchemas();   /* (#R406) 126 argument schemas */
    const { auditAnswer } = makeAtlasAnswerAudit();
    /* ---- (#R43) PRECISE layer resolution. The user reported "レイヤーによっては混同している" — the old matcher
       fuzzy-matched loosely AND the model never saw the real layer names, so it guessed a name and the matcher
       guessed a layer (double-guess). Now: (a) the LIVE layer list is injected into the prompt (layerCatalogText)
       so the model targets EXACT names; (b) resolveLayer scores by exact-id / exact-text / data-layer / prefix /
       whole-word / token-coverage with a threshold; (c) toggleLayer VERIFIES the checkbox reached the wanted state
       and returns the EXACT label it toggled so the note shows precisely what happened (no more silent confusion). */
    const _lnorm=s=>{ try{ return String(s==null?'':s).replace(/^[^\p{L}\p{N}]+/u,'').toLowerCase().replace(/\s+/g,' ').trim(); }catch(_){ return String(s==null?'':s).toLowerCase().replace(/\s+/g,' ').trim(); } }; const TRES = makeAtlasTurnResults({norm:_lnorm, capabilities:CAPS});   /* (#R441) which of this turn's results the reply is built from — js/atlas-turn-results.js. ⚠ HERE and not beside POLICY/TCONT above: `_lnorm` is a `const` on this line, so building it earlier reads it inside its own temporal dead zone. */ const GLEDGER = makeAtlasGeoLedger({norm:_lnorm, geoObject:GEOBJ.geoObject}); const ADM1 = makeAtlasAdmin1({});   /* (#R489) the conversation's resolved places, and the shipped first-level boundary index. ⚠ `geoObject` is handed IN so the ledger stores #R397's shape and #R397's provenance classes rather than inventing a second opinion about what a place record is. */
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
      'pressure':'dl-ec-slp','air pressure':'dl-ec-slp','sea level pressure':'dl-ec-slp','気圧':'dl-ec-slp','давление':'dl-ec-slp','isobars':'dl-ec-slp','等圧線':'dl-ec-slp','isobaren':'dl-ec-slp','изобары':'dl-ec-slp','isobaras':'dl-ec-slp','gusts':'dl-ec-gust','wind gusts':'dl-ec-gust','gust':'dl-ec-gust','最大瞬間風速':'dl-ec-gust','突風':'dl-ec-gust','windböen':'dl-ec-gust','порывы ветра':'dl-ec-gust','rachas de viento':'dl-ec-gust',
      'aerosol':'dl-aod','haze':'dl-aod','smog':'dl-aod','エアロゾル':'dl-aod',
      'co2':'bx-wbco2','carbon dioxide':'bx-wbco2','二酸化炭素':'bx-wbco2',
      'eez':'dl-eez','exclusive economic zone':'dl-eez','排他的経済水域':'dl-eez',
      /* ⚠ (#R409) THE TWO DAY-BY-DAY WAR LAYERS HAD NO ALIAS AT ALL, in any language: 「第二次世界大戦」 was routed to the approximate
         whole-world `historicalMap` while the record sat one row away, reachable only by its full label. ⚠ ONE LINE — tests/atlas-capabilities-checks.test.mjs #R318 ⑨b, and (#R519) the four wars added after them are on it too, individual war names included: 中東戦争 and the Yugoslav wars are each SEVERAL wars and readers name the one they mean. */
      'ww1':'dl-ww1','wwi':'dl-ww1','world war 1':'dl-ww1','world war i':'dl-ww1','world war one':'dl-ww1','first world war':'dl-ww1','great war':'dl-ww1','第一次世界大戦':'dl-ww1','第一次大戦':'dl-ww1','一次大戦':'dl-ww1','erster weltkrieg':'dl-ww1','первая мировая война':'dl-ww1','primera guerra mundial':'dl-ww1','première guerre mondiale':'dl-ww1','제1차 세계 대전':'dl-ww1','第一次世界大戰':'dl-ww1', 'ww2':'dl-ww2','wwii':'dl-ww2','world war 2':'dl-ww2','world war ii':'dl-ww2','world war two':'dl-ww2','second world war':'dl-ww2','第二次世界大戦':'dl-ww2','第二次大戦':'dl-ww2','二次大戦':'dl-ww2','太平洋戦争':'dl-ww2','zweiter weltkrieg':'dl-ww2','вторая мировая война':'dl-ww2','segunda guerra mundial':'dl-ww2','seconde guerre mondiale':'dl-ww2','제2차 세계 대전':'dl-ww2','第二次世界大戰':'dl-ww2', 'korean war':'dl-korea','korea war':'dl-korea','the korean war':'dl-korea','朝鮮戦争':'dl-korea','韓戦':'dl-korea','韓戰':'dl-korea','朝鲜战争':'dl-korea','抗美援朝':'dl-korea','한국 전쟁':'dl-korea','한국전쟁':'dl-korea','6·25 전쟁':'dl-korea','6.25 전쟁':'dl-korea','koreakrieg':'dl-korea','корейская война':'dl-korea','guerra de corea':'dl-korea','guerre de corée':'dl-korea', 'vietnam war':'dl-vietnam','viet nam war':'dl-vietnam','the vietnam war':'dl-vietnam','second indochina war':'dl-vietnam','ベトナム戦争':'dl-vietnam','越南战争':'dl-vietnam','越南戰爭':'dl-vietnam','越戰':'dl-vietnam','베트남 전쟁':'dl-vietnam','베트남전쟁':'dl-vietnam','vietnamkrieg':'dl-vietnam','война во вьетнаме':'dl-vietnam','вьетнамская война':'dl-vietnam','guerra de vietnam':'dl-vietnam','guerre du viêt nam':'dl-vietnam','guerre du vietnam':'dl-vietnam', 'arab-israeli wars':'dl-mideast','arab israeli wars':'dl-mideast','arab-israeli war':'dl-mideast','six-day war':'dl-mideast','six day war':'dl-mideast','yom kippur war':'dl-mideast','october war':'dl-mideast','suez crisis':'dl-mideast','suez war':'dl-mideast','中東戦争':'dl-mideast','第三次中東戦争':'dl-mideast','第四次中東戦争':'dl-mideast','六日戦争':'dl-mideast','六日戰爭':'dl-mideast','阿以战争':'dl-mideast','阿以戰爭':'dl-mideast','중동 전쟁':'dl-mideast','중동전쟁':'dl-mideast','nahostkriege':'dl-mideast','sechstagekrieg':'dl-mideast','арабо-израильские войны':'dl-mideast','шестидневная война':'dl-mideast','guerras árabe-israelíes':'dl-mideast','guerre des six jours':'dl-mideast', 'yugoslav wars':'dl-yugoslavia','yugoslavia war':'dl-yugoslavia','bosnian war':'dl-yugoslavia','croatian war':'dl-yugoslavia','kosovo war':'dl-yugoslavia','breakup of yugoslavia':'dl-yugoslavia','ユーゴスラビア紛争':'dl-yugoslavia','ユーゴ紛争':'dl-yugoslavia','ボスニア紛争':'dl-yugoslavia','コソボ紛争':'dl-yugoslavia','南斯拉夫戰爭':'dl-yugoslavia','南斯拉夫战争':'dl-yugoslavia','유고슬라비아 전쟁':'dl-yugoslavia','보스니아 전쟁':'dl-yugoslavia','jugoslawienkriege':'dl-yugoslavia','югославские войны':'dl-yugoslavia','guerras yugoslavas':'dl-yugoslavia','guerres de yougoslavie':'dl-yugoslavia',
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
      'volcano':'beta-dl-volc2','volcanoes':'beta-dl-volc2','火山':'beta-dl-volc2',   'world heritage':'beta-dl-whs','heritage':'beta-dl-whs','unesco':'beta-dl-whs','世界遺産':'beta-dl-whs','遺産':'beta-dl-whs','welterbe':'beta-dl-whs','patrimoine mondial':'beta-dl-whs','patrimonio mundial':'beta-dl-whs','всемирное наследие':'beta-dl-whs','世界遗产':'beta-dl-whs','세계유산':'beta-dl-whs',
      /* (#R353) …and the three Volcano Intelligence overlays, by the words a reader would use */
      'volcanic ash':'beta-dl-volcash','ash cloud':'beta-dl-volcash','ash':'beta-dl-volcash','sigmet':'beta-dl-volcash','火山灰':'beta-dl-volcash','vulkanasche':'beta-dl-volcash','пепел':'beta-dl-volcash','ceniza volcánica':'beta-dl-volcash',
      'volcano hazard':'beta-dl-volchaz','hazard zones':'beta-dl-volchaz','lahar':'beta-dl-volchaz','ハザード':'beta-dl-volchaz','火山ハザード':'beta-dl-volchaz','ラハール':'beta-dl-volchaz',
      'so2':'beta-dl-volcso2','sulfur dioxide':'beta-dl-volcso2','sulphur dioxide':'beta-dl-volcso2','二酸化硫黄':'beta-dl-volcso2','火山ガス':'beta-dl-volcso2',
      'nato':'dl-nato','eu':'dl-eu','european union':'dl-eu','military spending':'dl-milSpend','defense spending':'dl-milSpend','国防費':'dl-milSpend','軍事費':'dl-milSpend',
      'former soviet union':'fsu','ussr':'fsu','soviet':'fsu','旧ソ連':'fsu',
      'historical borders':'beta-dl-histb','歴史的国境':'beta-dl-histb','ukraine frontline':'beta-dl-ukrfront','frontline':'beta-dl-ukrfront','前線':'beta-dl-ukrfront',
      'railway':'beta-dl-rail','railways':'beta-dl-rail','rail':'beta-dl-rail','trains':'beta-dl-rail','鉄道':'beta-dl-rail','railroad':'beta-dl-rail','railroads':'beta-dl-rail','rail network':'beta-dl-rail','鉄道網':'beta-dl-rail','track gauge':'beta-dl-rail','gauge':'beta-dl-rail','軌間':'beta-dl-rail','eisenbahn':'beta-dl-rail','железные дороги':'beta-dl-rail','ferrocarriles':'beta-dl-rail','railway reference':'cb-rail2','basemap railways':'cb-rail2','reference railways':'cb-rail2','鉄道の参照線':'cb-rail2','roads':'cb-roads','道路':'cb-roads',   /* (#R388) the bare words reach the ATLAS, not the basemap's reference line, which is ON by default — 「鉄道を表示して」 used to succeed while doing nothing; `cb-rail2` keeps words that name it (Architecture.md §7.3c) */
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
    function _bestRow(cat,q0){ const variants=[q0]; if(q0.length>3&&q0.endsWith('s')) variants.push(q0.slice(0,-1));   /* ⚠⚠⚠ (#R802) THE MATCHER IS HANDED THE REGISTER TO SEARCH, BECAUSE THERE ARE TWO OF THEM. The layer panel's checkboxes and `window.IntMapLayers` are separate registers that name the SAME layers differently — measured on production 2026-09-17: `layers.toggle` answered to 「Live aircraft traffic」, the reading register calls that row `aircraft`, and its checkbox is `dl-planes`. One scorer, two registers: this body is #R52's word-aware scoring unchanged, with `cat` a parameter instead of a capture, so the read door below cannot drift from the toggle door. */
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
      return (best&&bs>=40)?{row:best,score:bs}:null; }
    function resolveLayer(name){ const q0=_lnorm(name); if(!q0) return null;
      /* 1) deterministic ALIAS — exact, then "… layer/overlay" stripped, then singular. */
      const aliasKeys=[q0, q0.replace(/\s+(layer|overlay|data|map|cover)$/,'')]; if(q0.length>3&&q0.endsWith('s')) aliasKeys.push(q0.slice(0,-1));
      for(const k of aliasKeys){ const id=LAYER_ALIASES[k]; if(id){ const cb=_cbByKey(id); if(cb) return {cb,label:_labelOf(cb)||name,score:100}; } }
      /* 2) WORD-aware scoring (variants: as-typed + singular), subscript-folded so co2↔CO₂. */   const r=_bestRow(layerCatalog(),q0); return r?{cb:r.row.cb,label:r.row.label,score:r.score}:null; }   function layerDoor(name){ const LY=window.IntMapLayers, q0=_lnorm(name); if(!q0||!LY) return null; const RC=(function(){ try{ return (LY.list()||[]).map(id=>{ const lb=String((LY.state(id)||{}).label||id); return {read:id,id:String(id).toLowerCase(),label:lb,txt:_lnorm(lb),dl:''}; }); }catch(_){ return []; } })(); const d=resolveLayer(name); let r=_bestRow(RC,q0); if(!r&&d){ const cid=String(d.cb.id||'').toLowerCase(); r=_bestRow(RC,_lnorm(d.label)); if(!r){ const m=RC.filter(x=>x.id===cid||('dl-'+x.id)===cid)[0]; if(m) r={row:m,score:100}; } } if(!r&&!d) return null; return { read:r?r.row.read:null, label:d?d.label:r.row.label, on:r?!!(LY.state(r.row.read)||{}).on:!!d.cb.checked }; }   /* ⚠ 「on」 is asked of whichever register can answer for what was found: a registration states its own `on()` (js/map-ui.js — `aircraft` reads the rendered layer, `elevation` is always on), and a panel row with no registration has only its checkbox. */   /* ⚠⚠⚠ (#R802) THE ONE PLACE THE TWO REGISTERS ARE HELD AGAINST EACH OTHER, and nothing in it is a hand-written table of spellings (.agents/rules/no-ad-hoc-hardcoding.md §1): the reading register is enumerated by `list()` and labelled by `state(id).label`, the panel by `layerCatalog()`, and the last bridge is the registry's OWN convention — js/map-ui.js `isOn(id)` looks for the checkbox `dl-`+id or id, so that rule read backwards turns a checkbox back into a registration. A layer added tomorrow is reachable by existing. ⚠ `read:null` WITH a label is a real answer — 「that layer exists and is drawn, but nothing samples it」 — which is a different sentence from 「there is no such layer」, and the case below says both. */
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
    const { DEIXIS_RE, REGION_ALIASES, WORLD_RE, codeAtPoint, resolveCountry, resolveCountrySync, _bboxOK, _classBonus, _geoAgrees, _gvStrong, _nomExtent, _rrResolve, _selfLocSeed, flyToBox, geoVerify, geoVerifyMany, geocode, parseDirectional, placeExtent, regionBox, sliceBox, whereMiss } = makeAtlasGeoResolve(HOST, { GE, L, esc, _bboxSoftPoly, _cgPoly, _clipGeoRect, _codesGeo, _expandRegionCompound, _geoArea, _hlLegendHtml, _hlPaletteColor, _lnorm, _ptInGeo, _setLast, _validGeo, askAIJSONEnvelope, composeRegion, fbbox, geo, localFuzzyPlaces, regionGroup, cName, countryStats: () => (typeof countryStats==='undefined'?null:countryStats), lastPlace: () => _lastPlace });
    /* (#R199) ↳ js/atlas-controls.js — the full-control action surface — real UI controls and module methods.
       Moved whole; the 8 names below are what the rest of this file still calls. */
    const { clickId, controlCatalog, controlEffect, doBaseDisplay, doControl, doHeritage, doModule, doRadiationObs, doVolcano, findControl, kexec, moduleCatalog, radiationChain, setSel } = makeAtlasControls(HOST, { L, R, _ctlTogHtml, esc, note, warn });
    /* (#R406) ONE tool surface for the module, not one per turn. What IS per-turn is where a call
       lands: `_turnRunAction` is the running turn's executor, so the surface can be built (and
       inspected) the moment Atlas loads rather than only once a question is in flight. */
    let _turnRunAction=null;
    const TOOLS=makeAtlasToolSurface({ capabilities:CAPS, schemas:SCHEMAS,
      runAction:(action)=>(_turnRunAction?_turnRunAction(action):Promise.resolve({ ok:false, error:'no_turn', message:'no turn is running' })) });
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
    function drawChoro(metricKey0,order,color){ const _sp=metSpec(metricKey0); if(!_sp) return unknownMetric(metricKey0);
      const metricKey=_sp.key, m=_sp.m;   /* (#R740) resolved through the ONE resolver, so XMET (lifeExp/internet) shades too */
      if(!geo()) return R(false, warn('⚠ '+L('Map data not ready yet','地図データが未準備です','Kartendaten noch nicht bereit','Данные карты не готовы','Datos del mapa no listos')));
      /* (#R61) optional shading hue — honoured for REAL (setPaintProperty on the live layer) or honestly flagged. */
      let cWarn=''; if(color!=null&&String(color).trim()!==''){ const pc=parseColor(color); if(pc) _choroRamp=rampFrom(pc); else cWarn=warn('⚠ '+L('Unknown color','色を認識できません','Unbekannte Farbe','Неизвестный цвет','Color desconocido')+': '+esc(color)); }
      clearHl(); clearChoro(); clearPolyHl(); clearLineHl(); if(!ensureChoroLayer()) return R(false, warn('⚠ '+L('Could not draw the map shading','地図の濃淡を描けませんでした','Karteneinfärbung fehlgeschlagen','Не удалось окрасить карту','No se pudo sombrear el mapa')));
      try{ GE().layers.setPaint('nlq-choro','fill-color',_choroFillExpr(_choroRamp)); }catch(_){}
      const vals=[]; for(const code in countryStats){ const s=countryStats[code]; if(!isRankableCountry(s)) continue; let v=m.get(s); if(v==null||isNaN(v)) continue; if(m.log&&v<=0) continue; vals.push({code, raw:v, t:(m.log?Math.log(v):v)}); }
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
      html+='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">'+L('Max','最高','Höchster','Макс.','Máx.')+': '+esc(nm(countryStats[top.code]))+' ('+esc(fmtVal(metricKey,top.raw))+') · '+L('Min','最低','Niedrigster','Мин.','Mín.')+': '+esc(nm(countryStats[bot.code]))+' ('+esc(fmtVal(metricKey,bot.raw))+')</div>';
      return R(true, note(html)+cWarn, {meta:{painted:{choro:Object.keys(_choroState)}}}); }   /* (#R760) declared, so a redraw of the same state is `already_there` — tests/atlas-agent-repeat-checks.test.mjs (#R760) */
    /* ==== (#R75) vision §10/§13 groundwork — metric series shared by explore & scoreMap ==== */
    const { METRICS, XMET, VMET, XVMET, metAll, metKeys, metSpec, unknownMetric, isRankableCountry } = makeAtlasMetrics(HOST, { LA, lx, L, esc, warn, R });   /* (#R740) ONE metric set and ONE resolver — js/atlas-metrics.js, where the production measurement behind it is written. ⚠ INSTANTIATED HERE, below `warn`/`R`, because those are `const`s of this closure: a hand-off written where METRICS used to stand (line 94) would read them inside their temporal dead zone. */
    /* one component (bundled metric or a World-Bank indicator code) → {label, vals:{ISO3:num}, log} */
    async function _seriesFor(comp){ try{
      if(comp&&comp.wb){ if(!(window.IntMapWB&&window.IntMapWB.fetch)) return null;
        let m=null; try{ m=await window.IntMapWB.fetch(String(comp.wb).trim()); }catch(_){ m=null; }
        if(!m) return null; const vals={}; for(const cd in m){ const v=m[cd]&&m[cd].v; if(v!=null&&isFinite(v)) vals[cd]=+v; }
        if(Object.keys(vals).length<20) return null;
        return {label:String(comp.label||comp.wb).slice(0,60),vals,log:false,src:'World Bank '+String(comp.wb)}; }
      const sp=metSpec(comp&&(comp.metric||comp.key||comp.name)); if(!sp) return null;
      await _fillMetric(sp.key);
      const vals={}; for(const cd in countryStats){ const s=countryStats[cd]; if(!isRankableCountry(s)) continue; let v=sp.m.get(s); if(v==null||isNaN(v)) continue; if(sp.m.log&&v<=0) continue; vals[cd]=+v; }   /* (#R775) _normSeries scales each component between this series minimum and maximum, so one non-country outlier moves EVERY country in the composed score, not only its own row */
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
    /* (#R199/#R733) ↳ js/atlas-geo-resolve.js — name/identifier → country, point-in-polygon and all.
       Moved whole when the identifier rule landed there: half a rule in each file is two sources of truth. */
    /* short human label for a step, used in the honest failure summary */ function actLabel(a){ return TCONT.actionLabel(a); }   /* (#R419) — and why `question` had to be in it: js/atlas-turn-continuity.js */
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
      /* ⚠ mode 'relay': NOT a GDELT query. This was one per visitor per boot, through the whole ladder — measured 2026-09-27 as a relay 502 (GDELT's own 429) plus an aborted direct read in every visitor's console, and upstream load that GDELT counts. peekOwnRelay (js/proxy-fetch.js) asks gdelt-relay what the upstream last said and keeps 「our relay is down」, 「GDELT is refusing for now」 and 「nothing observed yet」 apart. */
      {k:'GDELT news', u:'https://api.gdeltproject.org/api/v2/doc/doc?query=news&mode=artlist&maxrecords=1&format=json&timespan=1d', mode:'relay'}
    ];
    async function _probeOne(p){ const t0=Date.now();
      if(p.mode==='relay'){ try{ return await peekOwnRelay(p.u,8000); }catch(_){ return {ok:false, state:'down', ms:Date.now()-t0, status:0}; } }
      try{ const c=('AbortController' in window)?new AbortController():null; const to=c?setTimeout(()=>{ try{ c.abort(); }catch(_){} },7000):null;
        const r=await fetch(p.u,c?{signal:c.signal,cache:'no-store'}:{cache:'no-store'}); if(to) clearTimeout(to); return {ok:!!(r&&r.ok), ms:Date.now()-t0, status:r?r.status:0}; }catch(e){ return {ok:false, ms:Date.now()-t0, status:0, err:(e&&e.name)||'error'}; } }
    async function probeEndpoints(force){ if(_HEALTH.probing) return _HEALTH.endpoints; if(!force&&_HEALTH.endpoints&&(Date.now()-_HEALTH.probedAt)<300000) return _HEALTH.endpoints;
      _HEALTH.probing=true; try{ const res={}; await Promise.all(_PROBES.map(async p=>{ res[p.k]=await _probeOne(p); })); _HEALTH.endpoints=res; _HEALTH.probedAt=Date.now(); return res; } finally{ _HEALTH.probing=false; } }
    async function healthCheck(opts){ opts=opts||{}; const news=_newsHealth(), layers=_layerHealth();
      let endpoints=_HEALTH.endpoints; if(opts.probe!==false){ try{ endpoints=await probeEndpoints(opts.probe===true); }catch(_){} }
      const down=endpoints?Object.keys(endpoints).filter(k=>endpoints[k].ok===false&&endpoints[k].state!=='busy'):[], busy=endpoints?Object.keys(endpoints).filter(k=>endpoints[k].state==='busy'):[];   /* a refusing upstream behind a live relay is not IntMap's pipe being down, and ok:null (nothing observed yet) is neither */
      const ok=(!news.stale)&&(layers.bad===0)&&(down.length===0);
      return {ok, news, layers, endpoints, down, busy, probedAt:_HEALTH.probedAt}; }
    /* synchronous flag from the CACHE only (no network) — safe to call inside stateContext every turn. */
    function _healthFlag(){ try{ const parts=[]; const n=_newsHealth(); if(n.stale&&n.count) parts.push('the loaded news feed looks stale (newest item is '+(n.ageH==null?'undated':n.ageH+'h old')+' — the feed may have stopped updating)');
      const l=_layerHealth(); if(l.bad) parts.push(l.bad+' enabled layer(s) are NOT painting on the map'+(l.badN.length?(' ('+l.badN.join(', ')+')'):'')+' — their data may be loading or their source may be down');
      const ep=_HEALTH.endpoints; if(ep){ const down=Object.keys(ep).filter(k=>ep[k].ok===false&&ep[k].state!=='busy'), busy=Object.keys(ep).filter(k=>ep[k].state==='busy'); if(down.length) parts.push('these live data sources were unreachable at the last check: '+down.join(', '));
        if(busy.length) parts.push('these upstreams were refusing requests for now (rate limit / temporarily unavailable) at their last observed answer — the IntMap relay itself is up: '+busy.map(k=>k+(ep[k].upstreamAgeMs!=null?(' ('+Math.round(ep[k].upstreamAgeMs/60000)+' min ago)'):'')).join(', ')); }
      return parts.length?('SELF-DIAGNOSIS ALERT (IntMap health) — '+parts.join('; ')+'. If the question depends on this data, tell the user honestly and, where possible, use an alternative; suggest they say "diagnose" for a full check.'):''; }catch(_){ return ''; } }
    try{ window.IntMapDataHealth={ check:o=>healthCheck(o), news:_newsHealth, layers:_layerHealth, probe:f=>probeEndpoints(f), flag:_healthFlag, last:()=>_HEALTH.endpoints }; }catch(_){}
    /* light "常時監視": one probe ~25 s after load, then every 10 min — but ONLY while the tab is visible, so a
       backgrounded tab never spams the network (also keeps the headless preview quiet). ⚠ (#R408) `whenHidden` because _tick
       ITSELF owns that test for all three of its callers — this timer, the 25 s setTimeout and the visibilitychange below — and
       letting the wheel skip as well would put one policy in two places, where neither owns it. */
    try{ const _tick=()=>{ try{ if(document.visibilityState==='visible') probeEndpoints(false).catch(()=>{}); }catch(_){} };
      setTimeout(_tick,25000); everyTick('atlas-console:health-probe',600000,_tick,{whenHidden:true});
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
    /* (#R406) The user-side message for ONE step of the turn loop: what IntMap looks like now, what
       this conversation is about, what was asked \u2014 and, from the second step on, IntMap's mechanical
       record of what the previous calls actually did. ⚠ NO RULES AND NO CATALOGUE LIVE HERE. The
       [REQUEST PROFILE] block that stood in the middle of it announced a temporal mode, a geographic
       kind and a set of "requested outputs" derived from regular expressions, under the heading
       «the capability rules below are ENFORCED after you plan» \u2014 a machine's guess about the
       sentence, presented to the model as a constraint on it. State is context; it is not an order. */
    /* ⚠⚠⚠ (atlas-native-tools) NOT ONE STRING ANY MORE — ITEMS, AND A PREFIX THAT DOES NOT MOVE. What this built was ONE string per step, and ai-proxy kept its first 24,000 characters: the END went, which is this turn's own results (find_capability alone measures up to 39,235) and on a long conversation the [REQUEST] itself — with nothing said to the model or the reader. js/atlas-agent.js composeInput now lays the same content out as items and spends the budget per item (the order of what may be given up, and the proof, are written there). What is left HERE is what only this closure can read: `_agentCtx()` is taken ONCE per turn (the state as the request found it, the pinned point, the working context, the ledger), so the request item is byte-identical on every step and the provider's prompt cache holds everything before this turn's own calls; what changes step by step (the state after the calls, the attachment ledger, the frames) is the TAIL, after them. */
    function _agentCtx(){ let p=''; const ctx=stateContext(); if(ctx) p+='[MAP STATE WHEN THE REQUEST ARRIVED]\n'+ctx+'\n\n';
      if(_herePoint&&isFinite(_herePoint.lng)) p+='[PINNED POINT] The user clicked an EXACT spot: latitude '+(+_herePoint.lat).toFixed(4)+', longitude '+(+_herePoint.lng).toFixed(4)+(_herePoint.name?(' (near '+_herePoint.name+')'):'')+'. "here / this spot / ここ / hier / здесь / aqu\u00ed" refer to THIS coordinate, and actions accept place:"there" for it.\n\n';
      const wc=wctxBlock(); if(wc) p+='[WORKING CONTEXT] (what this conversation is currently about)\n'+wc+'\n\n'; try{ const _gl=GLEDGER.contextLines(); if(_gl.length) p+=_gl.join('\n')+'\n\n'; }catch(_){}   /* ⚠ (#R489) THE PLACES THIS CONVERSATION HAS ALREADY RESOLVED, AS IDENTIFIERS. Without this block the only thing a turn inherited about the fourteen oblasts it had just named was js/atlas-turn-continuity.js's 26-character action label, so the next turn re-extracted them from its own prose as bare strings with no country and no kind — and then geocoded, translated, retried and web-verified every one of them again. js/atlas-geo-ledger.js */
      return {text:p, state:ctx}; }
    function _agentInput(req, q, c0){ let tail=''; try{ const now=stateContext(); if(now&&now!==c0.state) tail+='[CURRENT MAP STATE — now, after the calls above]\n'+now+'\n\n'; }catch(_){}
      try{ tail+=ATTACH_LOG.declare(_curTurn,(_atlSentNames||[])); }catch(_){}   /* ⚠⚠⚠ (#R773) 前のターンで添付され、このリクエストには載っていないもの（画像・PDF）を**名前で述べる**。渡さないことと、在ることを黙っていることは別である。中身は recall_attachment が取り寄せる */ try{ tail+=VFRAMES.promptBlock(); }catch(_){}   /* ⚠ (#R493) THE IMAGES ATTACHED TO THIS CALL, NAMED — they arrive through the vision channel carrying no labels of their own, so without these sentences a second frame is indistinguishable from the first and neither is tied to the place it shows. Written in js/atlas-view-capture.js, beside the ledger that holds them. */
      if(req&&req.final) tail+='[Answer the reader now. Do not call any more tools.]\n';
      return AGENT.composeInput({ history:_hist.map(x=>{ const s=String((x&&x.s)||''); return s.indexOf('User: ')===0?{role:'user',content:s.slice(6)}:{role:'assistant',content:s.indexOf('Atlas: ')===0?s.slice(7):s}; }),   /* ⚠ (#R413) `_hist` is bounded in ONE place (`recordTurn`, 48) and read whole here; what the budget gives up is said by composeInput, never cut silently. (#R298) an entry is {t,s} */
        request:c0.text+'[REQUEST]\n'+q, transcript:(req&&req.messages)||[], tail, fence:POLICY.turnMechanics.fence }); }   /* ⚠ (#R801) the fence travels with the composer: every tool output is wrapped in it (js/atlas-agent.js) */
    /* ---- (#R61) INTEGRATED ANALYSIS ("レイヤーの数値や最新ニュース、その他様々なIntMapの機能を統合して分析…
       横断的で統合的な出力"): Atlas gathers REAL data from the sources IntMap already uses — the loaded news
       (globalData; loaded on demand via fetchData if empty), live weather / air quality / sea temperature /
       elevation (Open-Meteo — already a listed provider), recent earthquakes (USGS — already the map layer's
       source) and countryStats — then ONE text-AI call synthesizes the answer FROM THAT DATA ONLY. Datasets
       that returned nothing are listed honestly in the footer (never silently pretended). ---- */
    const { EVIDENCE_BUDGET_MS, GATHER_BUDGET_MS, WEB_BUDGET_MS } = ATLAS_BUDGETS;   /* (#R452) the clocks, the bounded gather and the evidence fetcher live in js/atlas-deadlines.js — this file has a SHRINK-ONLY ceiling, so the subject moved OUT rather than the ceiling moving up */
    const turnSignal = () => { try{ return _abortCtl?_abortCtl.signal:undefined; }catch(_){ return undefined; } }, _fetchJSON = makeFetchJSON(turnSignal);   /* ⚠ read at CALL time — `run()` installs the controller when a turn starts, so one captured here would belong to no turn */
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
    let _lastQuakeFeatures=null;   /* (#R397) the RAW USGS rows, kept because _quakeData returns prose and the cross-domain ranking needs magnitudes, times and positions */
    async function _quakeData(ctx){ const j=await _fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'); if(!j||!Array.isArray(j.features)||!j.features.length) return null;
      let fs=j.features; _lastQuakeFeatures=j.features;
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
    /* (#732) what the reader's 「使用データ」 line calls an article, by where IntMap got it — the two words that line always used, now carried ON the record so the line can name only the ones an answer cites */
    const _newsLbl=o=>(o==='gdelt'||o==='gnews')?L('web news search','Webニュース検索','Web-News-Suche','поиск веб-новостей','búsqueda de noticias web'):L('news','ニュース','News','новости','noticias');
    /* Render the dated evidence as the single NEWS EVIDENCE block. */
    /* (atlas-find-semantic) `idOf` = the evidence registry's own numbering (js/atlas-evidence.js) — when the block is
       written for a structured answer the ids come from there, because that registry is what a citation is resolved
       against; a line it holds no record for is printed without an id rather than under a number that names another article. */
    function _evidenceBlock(recs,idOf){ if(!recs||!recs.length) return '';
      const lines=recs.map(r=>{ const id=idOf?idOf(r.url):r.id; return '['+(id||'no id — not citable')+'] title: '+r.title+' | source: '+(r.src||'?')+(r.origin?(' ('+(_ORIGIN_LBL[r.origin]||r.origin)+')'):'')+(r.place?(' | place: '+r.place):'')+' | article_date: '+(r.date||'unknown')+' | date_type: '+r.dateType+' | event_date: unknown | url: '+(r.url||'(none)'); });
      return lines.join('\n'); }
    /* (#R131) The analysis system prompt. Rebuilt around the Central-Asia failure modes: it now carries a real
       clock, forbids treating an article date as an event date, forbids inferring actors/causality/escalation
       from a headline, tells a monitoring judgment to prefer the LOWER alert when no in-window event is verified,
       demands the requested output structure BEFORE brevity, and names coverage gaps in a multi-country request. */
    function _analysisSystemPrompt(nowCtx, freshness, coverage, lang){
      const multi=coverage&&coverage.countries&&coverage.countries.length>1;
      let s=personaPrompt('the analysis engine of the IntMap world map')/* (#R285) identity + character, from js/atlas-persona.js */+POLICY.turnMechanics.observed/* (#R801) the DATA blocks below are fenced; this says what the fence means */+'Current local time: '+nowCtx.local+' ('+nowCtx.tz+'). Never treat the current time as a future date, and never state a date beyond it as if it had happened. ';
      if(freshness&&freshness.windowMs) s+='The user asked about a specific recent time window; a [TIME CONTEXT] block gives the exact requested evidence window. Only an EVENT whose own date is verified to fall inside that window counts as in-window direct evidence. ';
      s+='Write a focused, analytical answer to the QUESTION. FOLLOW THE OUTPUT STRUCTURE THE USER ASKED FOR (their required sections, ordering and any leading verdict) BEFORE applying any brevity — if the user specified a format, completing that format takes priority over length. ';
      /* ---- date / evidence semantics (the core fix) ---- */
      s+='EVIDENCE SEMANTICS (critical — the user found Atlas treating article dates as event dates and headlines as confirmed facts): the NEWS EVIDENCE items carry an article_date with a date_type of publication_date or gdelt_seen_date. A publication_date or a GDELT seen date is when the ARTICLE appeared — it is NOT the event date. event_date is unknown unless the item wording itself verifies when the event occurred. Do NOT place an item inside the requested time window on the strength of its article date; only a verified event_date puts an event in the window. A headline-only record is a LEAD, not a confirmed description — do NOT infer the actors, the causality, whether an incident was domestic or interstate, or an event classification from a headline alone. A serious-sounding or alarming headline is not, by itself, evidence of escalation. Distinguish "an article reports a problem" from "a short-term crisis is occurring": reports of a vulnerability, shortage or tension are not the same as a confirmed protest, closure, clash or breakdown, and must not be upgraded into one. ';
      /* ---- monitoring / alert judgments ---- */
      s+='If the question asks for a monitoring, alert, escalation or risk-level judgment: do NOT raise the level on unverified leads. If the requested time window contains no VERIFIED event, prefer the lower-alert conclusion (e.g. "maintain") unless OTHER verified indicators independently justify escalation. Treat a routine, scheduled diplomatic meeting or regular official event as WEAK counterevidence about short-term local risk — its mere occurrence neither proves nor disproves ground-level developments, so do not lean on it as a strong reason either way. Separate your reasoning into: direct evidence (verified, in-window), unverified signals / leads, background context, and genuine counterevidence — and label which is which rather than blending them. ';
      /* ---- multi-country coverage ---- */
      if(multi) s+='This is a MULTI-COUNTRY request. A [REQUESTED COVERAGE] block lists the countries the user asked about. For EACH requested country for which the evidence has nothing usable and in-window, SAY SO explicitly — an unmentioned country reads as "nothing to report" when the truth may be "no data gathered". Do not generalise a finding about one country to the whole set. ';
      /* ---- preserved grounding + officeholder rules ---- */
      s+='Work primarily from the DATA blocks below (loaded news, the live GDELT + Google News evidence IntMap gathered, live Wikidata leaders, Wikipedia background, weather/quakes/stats where relevant). If a web-search tool is attached this turn, USE it to verify and fill gaps and cite the source URLs; if none is attached, do not claim to have searched the web. When the evidence has no fresh, dated, question-relevant items, do NOT assert "nothing is happening" — say honestly, in the answer language, that the available evidence has nothing recent on this and name what it covered. CURRENT OFFICEHOLDERS (prime minister / president / cabinet / party leader): your parametric memory is presumed STALE. If a CURRENT NATIONAL LEADERS block is present it was queried LIVE from Wikidata — use it as the primary answer (cite "Wikidata live query") and let it override your memory; otherwise name an officeholder ONLY if the evidence names them with a date. GROUNDING RULE (the user reported Atlas inventing events that never happened): EVERY event, figure, name and date must be traceable to the DATA blocks (or to attached web-search results this turn) — never from parametric memory, never embellished, never invented; an honest "could not verify from the available evidence" is REQUIRED and always better than a plausible but unverified claim. Do NOT recite weather, "no earthquakes" or statistics unless they answer the question. GROUNDING IS NOT A CEILING (#R397): the rule above says every claim must be TRACEABLE, not that IntMap\'s blocks are all you may use. A DATA block that is thin, stale, one-sided or simply not about what was asked should be LEFT OUT rather than padded into the answer, and the live search attached to this call is a first-class source, not a supplement to it. Where a DATA block and a searched source CONFLICT, do not prefer the block because it is IntMap\'s: compare their dates and their reliability, follow the more defensible one, and say in the answer that the two disagree and which you took. What stays forbidden is unverified material presented as verified. ';
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
      get capabilities(){ return CAPS; },
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
        /* (#R406) The #R135 self-checks that stood here exercised the request profile, the plan
           rewriter and the goal gate. All three are removed; the turn loop is checked by
           tests/atlas-agent-loop-checks.test.mjs (#R406) and tests/atlas-agent-loop-checks.test.mjs (#R406), which run the real modules. */
        const passed=R.filter(x=>x.ok).length;
        try{ if(typeof console!=='undefined'){ console.log('%c[IntMapAtlasQA] '+passed+'/'+R.length+(passed===R.length?' PASS':' FAIL'),'font-weight:bold'); R.forEach(x=>console.log((x.ok?'✓ ':'✗ ')+x.id+(x.detail?('  — '+x.detail):''))); } }catch(_){}
        return { pass:passed===R.length, passed, total:R.length, results:R, evBlock, header, webMode }; }
    };
    /* (#R135 §17) Developer diagnostics for the LAST Atlas turn — request profile, the model's original plan, the
       validated plan, rejected/rewritten actions, per-action structured outcomes, semantic-retry blocks, scope
       changes and the final goal validation. Not shown to normal users. window.IntMapAtlasDebug.lastPlan(). */
    try{ window.IntMapAtlasDebug={ lastPlan:function(){ return _atlasDbg; },   /* (#R406) this turn's steps, tool calls and rejections — js/atlas-agent.js */
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
      mdMini:function(t){ try{ return mdMini(t); }catch(_){ return ''; } }, linkCards:function(l,r,tp){ try{ return linkCards(l,r,tp); }catch(_){ return ''; } },   /* (#R494) on ONE line: this file's shrink-only ceiling (tests/atlas-capabilities-checks.test.mjs #R318 ⑨b / r419 ⑨d) is a LINE count, and tests/r494.spec.js needs the real card row to click its overflow chip */
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
    const { overpassRaw, _gdeltNews, _gnewsNews, _leaderData, _wikiSummary, aiFacilities, overpassPOIs, wikidataPOIs } = makeAtlasSources(HOST, { _fetchJSON, askAIJSON, countryStats, nm, EVIDENCE_BUDGET_MS, WEB_BUDGET_MS, turnSignal });
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
        if(wb){ const direct=IntMapSafe.url(_poiWikiUrl(p));   /* (#R801 SEC) `wikiUrl`/`wiki`/`wd` arrive from Wikidata/Overpass: same http(s)-only guard as the article button below, and '' falls through to the name probe */
          if(direct){ wb.style.display='inline-flex'; wb.onclick=()=>{ try{ window.open(direct,'_blank','noopener'); }catch(_){} }; }
          else if(p.name){ const wl=({jp:'ja'})[HOST.lang]||HOST.lang||'en';
            const probe=host=>fetch('https://'+host+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(p.name).replace(/ /g,'_'))).then(r=>r.ok?r.json():null).catch(()=>null);
            probe(wl).then(j=>j||((wl!=='en')?probe('en'):null)).then(j=>{ const u=IntMapSafe.url(j&&j.content_urls&&j.content_urls.desktop&&j.content_urls.desktop.page);   /* (#R801 SEC) a fetched page's own link, through the same guard */
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
    let _atlasOutcomes=null;     /* current-turn per-action outcome sink (array while a run() turn executes) */ const VFRAMES=makeViewCapture({ GE:GE, L:L, esc:esc, waitIdle:HOST.aiWaitMapIdle, snapshot:()=>{ try{ return ASTATE.snapshot(); }catch(_){ return null; } }, overpass:(q)=>overpassRaw(q,20000) });   /* (#R493) the per-turn frame ledger — the pixels Atlas captured, kept OUT of the transcript (js/atlas-view-capture.js says why that separation IS the design). ⚠⚠⚠ (#R589) `overpass` IS THE LOOKUP THAT MAKES «これなに» ANSWERABLE: without it view.inspect hands the model a picture and eleven camera numbers, which is how a 355,000 m² warehouse in 名古屋 came back as a supermarket with an invented tenant and a citation nobody fetched (js/atlas-view-ground.js measures why). The fetch is js/atlas-sources.js's, beside the mirror list it races — this file is shrink-only (tests/atlas-turn-checks.test.mjs #R419 ⑨d), and the kernel shrinks by moving. */
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
      await settleWithin(jobs,GATHER_BUDGET_MS);   /* (#R452) bounded — a source that has not answered by now is one this brief goes without, not one it waits behind */
      const evRecs=[]; for(const r of evSink){ if(!r||!r.title) continue; evRecs.push({id:'e'+(evRecs.length+1),title:String(r.title).slice(0,180),src:String(r.src||''),date:String(r.date||''),place:String(r.place||'')}); if(evRecs.length>=30) break; }
      let block=''; if(wiki) block+='[BACKGROUND (Wikipedia — stable reference, not news)]\n'+POLICY.turnMechanics.fence.wrap(wiki)+'\n\n';   /* (#R801) outside text, fenced — see _agentPrompt */
      if(evRecs.length) block+='[LIVE NEWS EVIDENCE (CURRENT — use ONLY for the present-day part; each is a dated LEAD, the article date is NOT the event date)]\n'+POLICY.turnMechanics.fence.wrap(evRecs.map(e=>'['+e.id+'] '+e.title+(e.src?(' — '+e.src):'')+(e.date?(' ('+e.date+')'):'')+(e.place?(' — '+e.place):'')).join('\n'))+'\n\n';
      const yearLine=year!=null?('The situation is asked about AS OF the year '+year+'. Anchor every statement to what was true around '+year+' — describe later or present-day conditions ONLY in a clearly separated "later" sentence, never as the '+year+' situation.'):(mode==='current'?('The situation is asked about as of the present ('+_nowISO+').'):'');
      const modeLine=mode==='mixed'?('This is a MIXED request: give BOTH the historical picture'+(year!=null?(' (around '+year+')'):'')+' AND the present-day picture, in two clearly separated parts of the explanation.'):'';
      const sys=personaPrompt('the research-mapping engine of the IntMap world map')/* (#R285) */+POLICY.turnMechanics.observed/* (#R801) the fence's meaning, from the one place that spells it */+'Produce a grounded, specific answer plus a set of REAL related places to map. '+yearLine+' '+modeLine+' No tool or function calling — the type names elsewhere are plain data. Return STRICT JSON ONLY (no prose, no code fence): {"title":str,"explanation":str,"temporalBasis":str,"items":[{"name":str,"locationName":str,"country":str,"kind":str,"summary":str,"dateOrPeriod":str}],"limitations":[str]}. RULES: "explanation" = 3-6 factual sentences in '+langR+' describing the situation'+(year!=null?(' around '+year):'')+' (who controlled it, why it mattered, the human/economic/strategic picture). "temporalBasis" = a short phrase naming the time the answer describes (e.g. "circa '+(year!=null?year:'present')+'"). "items" = 3-8 REAL, specific, well-known places or entities relevant to the topic (surrounding territories, powers, ports, islands, settlements, features) — for EACH give "locationName" (a real, geocodable city/place/feature name), "country" (the MODERN country it lies in, to help geocoding), "kind" (e.g. territory, port, island, power, settlement, region), "summary" (ONE sentence in '+langR+' on its relevance'+(year!=null?(' around '+year):'')+') and "dateOrPeriod" (e.g. "'+(year!=null?year:'present')+'" or a range). DO NOT output latitude/longitude — the app resolves locationName+country itself. Do NOT invent place names or URLs; use real, verifiable places only. For a historical answer, rely on established historical knowledge'+(wiki?' and the BACKGROUND above':'')+' — do NOT present current news as the historical situation, and do NOT fabricate specific casualty/figure claims. "limitations" = 0-2 short caveats in '+langR+' (approximate borders, uncertain figures). '+(topic?('Topic: '+topic+'. '):'')+(place?('Place: '+place+'. '):'');
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
      let rendered=false, method='', pinsDrawn=false;   /* (#R802) `rendered` is true for a CAMERA move too, so the pin declaration needs its own witness — the paint call itself */
      if(pins.length){ const _kpM=_poiAdd(opt.act); const _pvM=_kpM?_pois.slice():[]; clearPois(); _pois=_pvM.concat(pins.map(p=>({lng:p.lng,lat:p.lat,name:p.name,kind:p.kind,sum:p.sum,url:'',src:''})));   /* (#R489) researchMap keeps what this same turn already pinned — see the note beside `_poiAdd` */ let okP=paintPois(); for(let i=0;i<6&&!okP;i++){ await new Promise(r=>setTimeout(r,600)); okP=paintPois(); } rendered=okP; pinsDrawn=okP; method='pins'; }
      try{ let a=180,b=90,c=-180,d=-90,has=false;
        if(box){ a=Math.min(a,box[0][0]);b=Math.min(b,box[0][1]);c=Math.max(c,box[1][0]);d=Math.max(d,box[1][1]); has=true; }
        pins.forEach(p=>{ a=Math.min(a,p.lng);b=Math.min(b,p.lat);c=Math.max(c,p.lng);d=Math.max(d,p.lat); has=true; });
        if(has&&isFinite(a)&&(c-a)<340&&(c-a)>0.0001&&(d-b)>0.0001){ GE().camera.fitBounds([[a,b],[c,d]],{padding:80,maxZoom:9,duration:1000}); rendered=true; method=method||(box?'bbox':'pins'); }
        else if(ctr){ GE().camera.flyTo({center:ctr,zoom:(opt.zoom||4),duration:1000}); rendered=true; method=method||'center'; } }catch(_){}
      return { rendered, method, name, pinCount:pins.length, pinsDrawn, hasExtent:!!(ext&&(ext.box||isFinite(ext.lng))), pinIdx }; }
    /* (#R199) ↳ js/atlas-verify.js — code-side verification of an answer — content class, arithmetic, sources, mapping verdict.
       Moved whole; the 13 names below are what the rest of this file still calls. */
    const { _atlAuditSources, _atlChecksNoteHtml, _atlContentClass, _atlExtractPlaces, _atlGeocodeStrict, _atlMappingNoteHtml, _atlMappingVerdict, _atlNameOk, _atlNorm, _atlParseRat, _atlRegDomain, _atlShouldMap, _atlVerifyChecks, makePinReplyPlaces } = makeAtlasVerify(HOST, { L, esc });
    /* (#R397) `_pinReplyPlaces` moved into js/atlas-verify.js — eight of its dependencies already lived
       there and this file has a shrink-only ceiling. `_pois` is passed as a getter/setter pair, never as
       a captured value: this closure REPLACES the array, so a copy would go stale. */
    const _pinReplyPlaces = makePinReplyPlaces({ GE, GEOBJ, L, geocode, paintPois, ledger: GLEDGER,   /* (#R489) the audit RESOLVES places and then threw the result away — it is the one pass that sees every place an answer named, so it is where the conversation learns them (js/atlas-geo-ledger.js) */
      getPois: () => _pois, setPois: (v) => { _pois = v; } });
    const COMPOSE = makeAtlasMapCompose({ GE, L, esc, geocode, verifyPlaces: (names, ms) => geoVerifyMany(names, { turnId: _curTurnKey, timeoutMs: ms }), verifyStrong: _gvStrong, ledger: GLEDGER, geoObject: GEOBJ.geoObject, parseColor, dispatch: (x) => dispatch(x), countryCodeAt: (lng, lat) => { try { return (typeof codeAtPoint === 'function') ? (codeAtPoint(lng, lat) || '') : ''; } catch (_) { return ''; } } });   /* (#R511) js/atlas-map-compose.js — the ledger it files into is the one the pin audit and `pin` read, so a place composed here is data for the next turn. `dispatch` is hoisted; the lambda is read at run time. */
    /* ---- dispatch (every action maps to REAL existing engine code — "IntMapの全動作") ---- */
    /* (atlas-capability-modules) THE DISPATCH IS ONE LOOKUP. What each capability does used to be a `case` of a
       2,190-line switch here; it is now the `run` of that capability's entry in js/atlas-cap-<namespace>.js, beside its
       registry row and its argument schema (js/atlas-caps.js says what is derived from the entries).
       (atlas-one-declaration) A run is found by its row's column 1; every other spelling reaches it because its row
       declares it (`CAPS.dispatchName`). A spelling no row owns reaches `unknownAction` — the switch's old `default`.
       ⚠ `a.type` IS NOT REWRITTEN — a run that tells two of its spellings apart (`walkingRoute`, `standHere`) still reads the one it was sent.
       ⚠ NOT `async`: a run IS an async function, so returning its promise keeps the timing the switch had (a sync
       stretch up to the first `await`, then one promise) instead of adding a second promise around it.
       K — WHAT A RUN MAY USE OF THIS KERNEL, NAMED. A run is not a closure over this file any more, so it receives the
       names it reads as K: one getter per name (a `let` also gets a setter, and a run reads and writes it as
       `K.name`, so it always sees the live value). Built on the first dispatch, after every name here is initialised.
       A new capability that needs an internal this list does not name adds ONE getter here. K is not published. */
    var _capK = null;
    function capDeps(){ return _capK || (_capK = {
      get GLOSS(){ return GLOSS; },
      get R(){ return R; },
      get warn(){ return warn; },
      get L(){ return L; },
      get note(){ return note; },
      get COMPOSE(){ return COMPOSE; },
      get clearHl(){ return clearHl; },
      get clearChoro(){ return clearChoro; },
      get clearPolyHl(){ return clearPolyHl; },
      get clearLineHl(){ return clearLineHl; },
      get _CLEARED(){ return _CLEARED; },
      get _visSnapshot(){ return _visSnapshot; },
      get toggleLayer(){ return toggleLayer; },
      get doControl(){ return doControl; },
      get esc(){ return esc; },
      get _visDelta(){ return _visDelta; },
      get layerOpacityControl(){ return layerOpacityControl; },
      get resolveLayer(){ return resolveLayer; },
      get kexec(){ return kexec; },
      get _featTogHtml(){ return _featTogHtml; },
      get clickId(){ return clickId; },
      get WORLD_RE(){ return WORLD_RE; },
      get GE(){ return GE; },
      get DEIXIS_RE(){ return DEIXIS_RE; },
      get placeExtent(){ return placeExtent; },
      get _setLast(){ return _setLast; },
      get flyToBox(){ return flyToBox; },
      get _ambigNote(){ return _ambigNote; },
      get geocode(){ return geocode; },
      get _bboxOK(){ return _bboxOK; },
      get _langLine(){ return _langLine; },
      get _newsData(){ return _newsData; },
      get WEB_BUDGET_MS(){ return WEB_BUDGET_MS; },
      get _gdeltNews(){ return _gdeltNews; },
      get _gnewsNews(){ return _gnewsNews; },
      get askAIJSONEnvelope(){ return askAIJSONEnvelope; },
      get _curTurnKey(){ return _curTurnKey; }, set _curTurnKey(v){ _curTurnKey=v; },
      get linkCards(){ return linkCards; },
      get dropLeadTitle(){ return dropLeadTitle; },
      get mdMini(){ return mdMini; },
      get _herePoint(){ return _herePoint; }, set _herePoint(v){ _herePoint=v; },
      get _lastPlace(){ return _lastPlace; }, set _lastPlace(v){ _lastPlace=v; },
      get dispatch(){ return dispatch; },
      get ensureData(){ return ensureData; },
      get _mirrorLang(){ return _mirrorLang; },
      get countryStats(){ return countryStats; },
      get _fillMetric(){ return _fillMetric; },
      get metSpec(){ return metSpec; },
      get fmtVal(){ return fmtVal; },
      get nm(){ return nm; },
      get _fetchJSON(){ return _fetchJSON; },
      get overpassPOIs(){ return overpassPOIs; },
      get wikidataPOIs(){ return wikidataPOIs; },
      get resolveCountrySync(){ return resolveCountrySync; },
      get _nomExtent(){ return _nomExtent; },
      get unknownMetric(){ return unknownMetric; },
      get clampN(){ return clampN; },
      get rank(){ return rank; },
      get lx(){ return lx; },
      get listHtml(){ return listHtml; },
      get ratio(){ return ratio; },
      get relate(){ return relate; },
      get drawChoro(){ return drawChoro; },
      get setSel(){ return setSel; },
      get HOST(){ return HOST; },
      get applyTheme(){ return applyTheme; },
      get applyAccent(){ return applyAccent; },
      get saveSettings(){ return saveSettings; },
      get _langCode(){ return _langCode; },
      get setLang(){ return setLang; },
      get setGrid(){ return setGrid; },
      get resolveCountry(){ return resolveCountry; },
      get showCountryDetail(){ return showCountryDetail; },
      get layerDoor(){ return layerDoor; },
      get doVolcano(){ return doVolcano; },
      get doHeritage(){ return doHeritage; },
      get doRadiationObs(){ return doRadiationObs; },
      get whereMiss(){ return whereMiss; },
      get _tspOrder(){ return _tspOrder; },
      get _lastRouteCtx(){ return _lastRouteCtx; }, set _lastRouteCtx(v){ _lastRouteCtx=v; },
      get radiationChain(){ return radiationChain; },
      get _lastRadCtx(){ return _lastRadCtx; }, set _lastRadCtx(v){ _lastRadCtx=v; },
      get ymdISO(){ return ymdISO; },
      get GLEDGER(){ return GLEDGER; },
      get _lnorm(){ return _lnorm; },
      get addPin(){ return addPin; },
      get ADM1(){ return ADM1; },
      get parseColor(){ return parseColor; },
      get setTool(){ return setTool; },
      get refreshTool(){ return refreshTool; },
      get updateToolPanel(){ return updateToolPanel; },
      get t(){ return t; },
      get healthCheck(){ return healthCheck; },
      get ASTATE(){ return ASTATE; },
      get clearPois(){ return clearPois; },
      get clearFly(){ return clearFly; },
      get clearBlast(){ return clearBlast; },
      get clearElev(){ return clearElev; },
      get clearFac(){ return clearFac; },
      get clearAllPins(){ return clearAllPins; },
      get loadCountryData(){ return loadCountryData; },
      get _hlGen(){ return _hlGen; }, set _hlGen(v){ _hlGen=v; },
      get setHlColor(){ return setHlColor; },
      get _hlReadGptGroups(){ return _hlReadGptGroups; },
      get _codesGeo(){ return _codesGeo; },
      get _validGeo(){ return _validGeo; },
      get _hlValidCodeSet(){ return _hlValidCodeSet; },
      get _hlAdd(){ return _hlAdd; },
      get _hlPolys(){ return _hlPolys; }, set _hlPolys(v){ _hlPolys=v; },
      get _hlLines(){ return _hlLines; }, set _hlLines(v){ _hlLines=v; },
      get _hlPaletteColor(){ return _hlPaletteColor; },
      get paintPolys(){ return paintPolys; },
      get _verifyPolyPaint(){ return _verifyPolyPaint; },
      get _fitGroups(){ return _fitGroups; },
      get _hlLegendHtml(){ return _hlLegendHtml; },
      get _wctx(){ return _wctx; },
      get _hlReadNames(){ return _hlReadNames; },
      get highlight(){ return highlight; },
      get unionBox(){ return unionBox; },
      get fitTo(){ return fitTo; },
      get _hl(){ return _hl; }, set _hl(v){ _hl=v; },
      get _expandRegionCompound(){ return _expandRegionCompound; },
      get basinIntent(){ return basinIntent; },
      get riverIntent(){ return riverIntent; },
      get resolveHlTarget(){ return resolveHlTarget; },
      get _regionLabel(){ return _regionLabel; },
      get buildBasin(){ return buildBasin; },
      get fetchRiverLine(){ return fetchRiverLine; },
      get paintLines(){ return paintLines; },
      get LA(){ return LA; },
      get METRICS(){ return METRICS; },
      get layerCatalog(){ return layerCatalog; },
      get exitTool(){ return exitTool; },
      get _selfLocSeed(){ return _selfLocSeed; },
      get _curTurn(){ return _curTurn; }, set _curTurn(v){ _curTurn=v; },
      get _atlRecallImgs(){ return _atlRecallImgs; }, set _atlRecallImgs(v){ _atlRecallImgs=v; },
      get _atlRecallAtts(){ return _atlRecallAtts; }, set _atlRecallAtts(v){ _atlRecallAtts=v; },
      get VFRAMES(){ return VFRAMES; },
      get _poiColor(){ return _poiColor; }, set _poiColor(v){ _poiColor=v; },
      get aiFacilities(){ return aiFacilities; },
      get _pois(){ return _pois; }, set _pois(v){ _pois=v; },
      get paintPois(){ return paintPois; },
      get _PINNED(){ return _PINNED; },
      get _lastUserMsg(){ return _lastUserMsg; }, set _lastUserMsg(v){ _lastUserMsg=v; },
      get aiParseJSON(){ return aiParseJSON; },
      get askAI(){ return askAI; },
      get _poiAdd(){ return _poiAdd; },
      get _atlCleanUrl(){ return _atlCleanUrl; },
      get _buildResearchAnswer(){ return _buildResearchAnswer; },
      get _tryMapResearch(){ return _tryMapResearch; },
      get _gcKm(){ return _gcKm; },
      get missileClass(){ return missileClass; },
      get ballisticSolve(){ return ballisticSolve; },
      get _lastMissileCtx(){ return _lastMissileCtx; }, set _lastMissileCtx(v){ _lastMissileCtx=v; },
      get _ballTrack(){ return _ballTrack; },
      get drawBlastRings(){ return drawBlastRings; },
      get ballisticProfileSVG(){ return ballisticProfileSVG; },
      get elevGrid(){ return elevGrid; },
      get _mixc(){ return _mixc; },
      get ensureElevLayers(){ return ensureElevLayers; },
      get histMatch(){ return histMatch; },
      get HIST_SCENARIOS(){ return HIST_SCENARIOS; },
      get paintFactions(){ return paintFactions; },
      get flyAnimate(){ return flyAnimate; },
      get codeAtPoint(){ return codeAtPoint; },
      get OFFICE_RE(){ return OFFICE_RE; },
      get fetchData(){ return fetchData; },
      get _wikiSummary(){ return _wikiSummary; },
      get _weatherData(){ return _weatherData; },
      get _airData(){ return _airData; },
      get _sstData(){ return _sstData; },
      get _elevData(){ return _elevData; },
      get _leaderData(){ return _leaderData; },
      get _quakeData(){ return _quakeData; },
      get _statsData(){ return _statsData; },
      get GATHER_BUDGET_MS(){ return GATHER_BUDGET_MS; },
      get _nowContext(){ return _nowContext; },
      get _analyzeFreshness(){ return _analyzeFreshness; },
      get _analyzeHeaderBlock(){ return _analyzeHeaderBlock; },
      get _analyzeEvidence(){ return _analyzeEvidence; },
      get POLICY(){ return POLICY; },
      get _evidenceBlock(){ return _evidenceBlock; },
      get _newsLbl(){ return _newsLbl; },
      get ANOM(){ return ANOM; },
      get _lastQuakeFeatures(){ return _lastQuakeFeatures; }, set _lastQuakeFeatures(v){ _lastQuakeFeatures=v; },
      get stateContext(){ return stateContext; },
      get _analysisSystemPrompt(){ return _analysisSystemPrompt; },
      get runStructuredAnswer(){ return runStructuredAnswer; },
      get _statsFacts(){ return _statsFacts; },
      get renderAnswer(){ return renderAnswer; },
      get _pinReplyPlaces(){ return _pinReplyPlaces; },
      get answerPlainText(){ return answerPlainText; },
      get citedRecords(){ return citedRecords; },
      get auditMeta(){ return auditMeta; },
      get _FEAT_TOG(){ return _FEAT_TOG; },
      get doBaseDisplay(){ return doBaseDisplay; },
      get _cmpMetricKeys(){ return _cmpMetricKeys; },
      get _seriesFor(){ return _seriesFor; },
      get _normSeries(){ return _normSeries; },
      get isRankableCountry(){ return isRankableCountry; },
      get _choroRamp(){ return _choroRamp; }, set _choroRamp(v){ _choroRamp=v; },
      get rampFrom(){ return rampFrom; },
      get ensureChoroLayer(){ return ensureChoroLayer; },
      get _choroFillExpr(){ return _choroFillExpr; },
      get _choroState(){ return _choroState; }, set _choroState(v){ _choroState=v; },
      get _choroMetric(){ return _choroMetric; }, set _choroMetric(v){ _choroMetric=v; },
      get _customScoreName(){ return _customScoreName; }, set _customScoreName(v){ _customScoreName=v; },
      get XMET(){ return XMET; },
      get _pearson(){ return _pearson; },
      get _ranks(){ return _ranks; },
      get _havKm(){ return _havKm; },
      get overpassRaw(){ return overpassRaw; },
      get _agoH(){ return _agoH; },
      get newsSubject(){ return newsSubject; },
      get groupNewsEvents(){ return groupNewsEvents; },
      get EVENT_RULES(){ return EVENT_RULES; },
      get doModule(){ return doModule; },
      get _atlContentClass(){ return _atlContentClass; },
      get _atlVerifyChecks(){ return _atlVerifyChecks; },
      get _atlChecksNoteHtml(){ return _atlChecksNoteHtml; },
      get _curPlanCites(){ return _curPlanCites; }, set _curPlanCites(v){ _curPlanCites=v; },
      get _atlShouldMap(){ return _atlShouldMap; },
    }); }
    function dispatch(a,dctx){ try{ if(!a||!a.type) return Promise.resolve(R(true,'')); const t=CAPS.dispatchName(a.type);
      return ((typeof t==='string'&&CAP_RUN[t])||unknownAction)(a,dctx,capDeps()); }catch(e){ return Promise.reject(e); } }
    /* (#R64) "別の言語で話しかけても、言語設定の言語でしか返答しないのはやめろ" — Atlas answers in the language
       the USER'S MESSAGE is written in. Script/stop-word detection gives the model a strong hint; unclear input
       falls back to the UI language. */
    let _lastUserMsg='';
    function _replyLang(){ const s=String(_lastUserMsg||'');
      if(/[぀-ヿ]/.test(s)) return 'Japanese';   /* kana present → unambiguously Japanese */
      if(/[가-힯]/.test(s)) return 'Korean';
      if(/[؀-ۿ]/.test(s)) return 'Arabic';
      if(/[а-яё]/i.test(s)) return 'Russian';
      /* ⚠⚠⚠ (#732) THE LANGUAGE IS THE ONE WITH THE MOST EVIDENCE, NOT THE FIRST ONE ASKED. These tests ran in a
         fixed order and returned on the FIRST hit, and a hit was one word or one letter — so German, asked first,
         won on a single 「die」 or a single umlaut, and Spanish on a single 「los」 or 「la」, before English was ever
         asked. A place name carries exactly those: 「Show Los Angeles on the map」 answered in Spanish, 「What is the
         weather in Zürich?」 in German, 「Why did the dinosaurs die out?」 in German — while the same sentence held
         three or four English function words. MEASURED on production (2026-09-18, build R783): one English question
         of 46 was answered in German. Same word lists, same letters; each now counts, and the most-attested
         language wins. A tie goes to the reader's own UI language when it is among the tied, which is what the
         fallback below already means by 「unclear」. */
      if(/[a-zà-ÿœß]/i.test(s)){ const words=s.toLowerCase().split(/[^a-zà-ÿœß']+/).filter(Boolean);
        const LEX=[['German',/^(der|die|das|und|nicht|eine?|zeige?|bitte|karte|wo|ist)$/,/[äöüß]/],['Spanish',/^(el|la|los|las|una?|qué|cómo|dónde|muestra|país|por)$/,/[¿¡ñ]/],
          ['French',/^(le|les|une?|est|montre|où|carte|pays|s'il)$/,null],['Italian',/^(il|lo|gli|una?|dove|mostra|paese|per)$/,null],['English',/^(the|is|are|show|please|what|where|map|and|of|to)$/,null]];
        const sc=LEX.map(([nm,w,mark])=>[nm,words.filter(x=>w.test(x)).length+((mark&&mark.test(s))?1:0)]); const top=Math.max.apply(null,sc.map(x=>x[1]));
        if(top>0){ const tied=sc.filter(x=>x[1]===top).map(x=>x[0]); let ui=''; try{ ui=(typeof _aiLangName==='function')?_aiLangName():''; }catch(_){}
          return tied.indexOf(ui)>=0?ui:(tied.indexOf('English')>=0?'English':tied[0]); }
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
      /* ⚠ (#R451) `onScreen` — the reading surface can HAND its article to Atlas and be replaced by
         it (the normal sidebar has one surface, so opening Atlas closes the reader). The subject is
         still the subject; it is no longer on screen, and js/atlas-state.js says so in those words
         rather than claiming the reader is reading it right now. */
      try{ const rd=window._imReader; if(rd&&rd.open&&rd.title) o.article={ kind:(rd.kind==='event'?'event':'article'), title:String(rd.title).slice(0,140), publisher:rd.publisher||'', pubDate:rd.pubDate?String(rd.pubDate).slice(0,16):'', place:rd.place||'', loc:(rd.loc&&isFinite(rd.loc[0]))?[+rd.loc[0],+rd.loc[1]]:null, body:rd.body?String(rd.body).slice(0,2600):'', onScreen:rd.onScreen!==false }; }catch(_){}
      try{ const si=document.getElementById('map-search')||document.getElementById('search-input'); if(si&&si.value&&String(si.value).trim()) o.searchBox=String(si.value).trim().slice(0,60); }catch(_){}
      return o; }
    function _atlasOverlayState(){ const o={highlightCountries:0,highlight:null,choropleth:null,customScore:null,pins:null,polygons:null,lines:null,measure:null,radius:null,userPins:null,tool:''};
      try{ if(_hl&&_hl.size&&_ovlVisible('highlight')) o.highlightCountries=_hl.size; }catch(_){}
      try{ if(_wctx.highlight&&_wctx.highlight.name&&_ovlVisible('highlight')) o.highlight={name:_wctx.highlight.name,basis:_wctx.highlight.basis||''}; }catch(_){}
      try{ const _cs=_choroMetric&&metSpec(_choroMetric); if(_cs) o.choropleth={label:lx(_cs.m.label)};   /* (#R740) a lifeExp shading was on screen and this state said nothing was */
           else if(_choroMetric==='__custom'&&_customScoreName) o.customScore={name:_customScoreName}; }catch(_){}
      try{ if(_pois&&_pois.length) o.pins={n:_pois.length,kind:(_pois[0]&&_pois[0].sum)?'research':'poi'}; }catch(_){}
      try{ if(_hlPolys&&_hlPolys.length&&_ovlVisible('highlight')) o.polygons={n:_hlPolys.length,names:_hlPolys.map(p=>p.name).filter(Boolean).slice(0,4)}; }catch(_){}
      try{ if(_hlLines&&_hlLines.length) o.lines={n:_hlLines.length}; }catch(_){}
      try{ const fd=GE().layers.sourceData('nlq-fac-src'); if(fd&&fd.features&&fd.features.length) o.factions={n:fd.features.length}; }catch(_){} try{ if(_eraHl&&_eraHl.length) o.eraPolities={n:_eraHl.length,names:_eraHl.slice(0,4)}; }catch(_){}
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
    const _DOCS=makeAtlasCatalogText(HOST,{ moduleCatalog, langLine:_langLine, metricList:()=>metKeys().map(k=>k+' ('+lx(metAll()[k].label)+')').join(', ') });   /* (#R740) the planner's metric list is counted from the records, not typed */
    /* ══ (#R406) THE WHOLE SYSTEM PROMPT ═══════════════════════════════════════════════════════
       It used to be the persona, three policy clauses, six fixed paragraphs of accumulated rules,
       _DOCS.text() at 64,250 characters, 170 layer names and a ranked control list. Measured, the
       catalogue alone sent 41,178 characters for 「ありがとう」. What is left is who Atlas is, what
       it decides (js/atlas-policy.js), how to end a turn, and the tools — with their real schemas,
       which is the only part a model needs in order to call one correctly. */
    /* (atlas-native-tools) THE TOOLS ARE THE PROVIDER'S OWN FUNCTIONS (ai-proxy protocol 2) and what the model WRITES is only the declarations and the words — FINAL_SCHEMA in js/atlas-agent.js — so the tool block is not pasted here a second time. (atlas-legacy-protocol-removal) The second form this function had — the one-string envelope for an ai-proxy that predated protocol 2, with the calls inside the JSON and every tool written out (25,262 characters against 14,181, measured 2026-10-01) — was removed with that transport: every deployed ai-proxy speaks protocol 2 on all three providers. */
    function SYS(tools){
      return personaPrompt('the general intelligence and operating layer of IntMap, an interactive world map')
        +POLICY.all()
        +'REPLY FORMAT: you operate IntMap by calling its tools as FUNCTIONS \u2014 every call in one reply is run, in order, and its result comes back to you as that call\'s output. What you WRITE is one strict JSON object and nothing else \u2014 {"turn":"final"|"continuing","answer_mode":"text"|"map"|"chart"|"mixed","final_text":string}. '
        +'The fields are in the order the decision is made: what this reply IS, what it DOES, then what it SAYS. turn "final" means final_text is the complete answer and the turn ends here; turn "continuing" means final_text is NOT the answer yet and the work goes on in function calls \u2014 so a reply that says what you are about to do is "continuing", and the calls that do it belong in that SAME reply (a "continuing" reply that issued no call comes back to you like a rejected call, because nothing would have happened). A reply with no function calls ENDS the turn, and final_text is what the reader sees. answer_mode says what KIND of answer this is \u2014 "text": the map is untouched; "map": the map IS the answer and final_text frames it; "mixed": the words and the map each carry part. You decide it; but a "map"/"mixed" final is accepted only after something in this turn actually drew on or moved the map (compose_map draws a whole explanation in one call) \u2014 otherwise it comes back to you like a rejected call, and you either draw or answer as "text". To operate IntMap, '
        +'to look something up, or to search the web, put one or more calls in function calls: IntMap runs them and returns what '
        +'it OBSERVED, and you then decide whether to call more tools or to answer. Arguments are checked against each '
        +'tool\'s schema before anything runs; a rejected call comes back to you to fix and is never shown to the reader. '
        +_capIndex(tools)+'[TOOLS] The functions you hold ('+Object.keys(tools||{}).join(', ')+') are the whole call surface; every id in the index above is reached through find_capability and run_capability.\n'
        /* (atlas-one-declaration) LAST, because it is the only line of this prompt that depends on the reader's language: everything above it is
           the same bytes in every language, so it is one cacheable prefix instead of one per language. It used to stand above the capability index. */
        +'Write final_text in '+_langLine()+'.\n';
    }
    /* The capability index. The tools themselves travel as the provider's functions, which js/atlas-toolsurface.js
       builds; `find_capability` reaches the other hundred-odd. */   function _capIndex(tools){ try{ return String(CAPS.index(_directCaps(tools))||''); }catch(_){ return ''; } }   /* (#R733) the argument is the set of capabilities THIS prompt already hands over as typed tools, so the index can stop telling Atlas to go looking for the nine it is holding — js/atlas-capabilities.js has the production measurement.   (#R582) the registry's OWN index of every capability id, derived from js/atlas-capabilities.js. Without it SYS() named the door (find_capability) and not one thing behind it, so every decision Atlas took BEFORE deciding to search was taken about an IntMap with nine tools in it. ⚠ ON THIS LINE because the kernel has no headroom — same reason as the GLOSS import above. */
    /* (#R733) which capabilities this prompt ALREADY hands over by name, read off the surface itself — the
       index must stop telling Atlas to search for them (js/atlas-capabilities.js has the measurement). */
    function _directCaps(tools){ var out=[]; try{ Object.keys(tools||{}).forEach(function(k){ var id=tools[k]&&tools[k].capabilityId; if(id) out.push(id); }); }catch(_){} return out; }
    /* ---- UI ---- */
    let panel=null, chatEl=null, inEl=null, styled=false;
    let _atlImgs=[];   /* (#R149) pending pasted/attached image data-URLs to send with the next message (vision) */
    let _atlFiles=[];  /* (#R158/#R540) pending NON-image attachments, as ATL_FILE.read returned them: kind:'text' {name,text,size,truncated,encoding,from} or kind:'doc' {name,mime,b64} */
    /* (#R540) WHICH FILES ATLAS ACCEPTS IS NO LONGER A LIST — js/atlas-attach.js asks the BYTES (its header has the whole argument). Images → the vision
       channel. PDFs → the providers' own document block. Anything a text encoding decodes, including what a .docx/.xlsx/.pptx/.odt/.kmz/.zip holds → the attachment channel. Everything else is refused BY REASON. */
    const _atlWhy=(d)=>{ const w=d&&d.why; if(w==='too-big') return L('That file is too large','そのファイルは大きすぎます','Diese Datei ist zu groß','Этот файл слишком велик','Ese archivo es demasiado grande')+' ('+atlFmtBytes((d&&d.limit)||ATL_FILE.LIMITS.docBytes)+')';
      if(w==='legacy-office') return L('Old Office files (.doc/.xls/.ppt) cannot be read — save as .docx/.xlsx/.pptx or PDF','旧形式の Office ファイル（.doc/.xls/.ppt）は読めません。.docx/.xlsx/.pptx か PDF で保存し直してください','Alte Office-Dateien (.doc/.xls/.ppt) sind nicht lesbar — als .docx/.xlsx/.pptx oder PDF speichern','Старые файлы Office (.doc/.xls/.ppt) не читаются — сохраните как .docx/.xlsx/.pptx или PDF','Los archivos antiguos de Office (.doc/.xls/.ppt) no se pueden leer — guárdalos como .docx/.xlsx/.pptx o PDF');
      if(w==='docs-total') return L('Those documents are too large to send together','これらの文書は合計が大きすぎて一度に送れません','Diese Dokumente sind zusammen zu groß zum Senden','Эти документы вместе слишком велики для отправки','Esos documentos son demasiado grandes para enviarlos juntos')+' ('+atlFmtBytes(ATL_FILE.LIMITS.docsBytes)+')';
      if(w==='media') return L('Audio and video cannot be attached','音声・動画は添付できません','Audio und Video können nicht angehängt werden','Аудио и видео прикрепить нельзя','No se pueden adjuntar audio ni vídeo');
      if(w==='image-undecodable') return L('This browser could not decode that image','この画像形式はこのブラウザで読み取れませんでした','Dieser Browser konnte dieses Bild nicht dekodieren','Этот браузер не смог декодировать это изображение','Este navegador no pudo decodificar esa imagen');
      return L('No text could be read from that file','そのファイルからテキストを取り出せませんでした','Aus dieser Datei konnte kein Text gelesen werden','Из этого файла не удалось извлечь текст','No se pudo leer texto de ese archivo'); };
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
      rewindHist:(t)=>{ _hist=_hist.filter(x=>x&&x.t<t); try{ ATTACH_LOG.rewind(t); }catch(_){} } });   /* (#R773) 巻き戻したターンの添付も一緒に落とす——消えた質問の資料だけが会話に居座らないように */   const GLOSS = makeAtlasGloss(HOST, { L:L, esc:esc, R:R, note:note, warn:warn, chat:()=>chatEl, ask:(q)=>{ try{ if(inEl){ inEl.value=q; fire(); } }catch(_){} } });   /* (#R491) the term gloss, built beside the tool bar and on the same terms — it reads its context out of the rendered DOM, so all it needs is the picker, the escaper, the result helpers, the chat element and a way to put a follow-up into the composer (the starter chips' pick). ⚠ ON THIS LINE for the reason the import is: the kernel has no headroom */   const READ = makeAtlasReading(HOST, { L:L, esc:esc, bubble:bubble, run:run, ensure:ensure, focus:()=>{ try{ inEl.focus(); }catch(_){} }, open:()=>{ try{ open(); }catch(_){} }, pin:(lng,lat,nm)=>{ _herePoint={lng,lat,name:nm||''}; try{ _lastPlace={lng,lat,name:nm||''}; }catch(_){} }, reset:()=>{ _lastUserMsg=''; } });   /* (#R776) the arrival bubble both «Ask Atlas» buttons land on. ⚠ ON THIS LINE for the reason the import is: the kernel has no headroom (tests/atlas-capabilities-checks.test.mjs #R318 ⑨b) */
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
    const { renderExamples, wireExamples, pointExamples } = makeAtlasExamples(HOST, { L, GE, codeAtPoint, countryStats, cName, loadCountryData, geo, panelEl:()=>panel, pick:(t)=>{ if(inEl){ inEl.value=t; fire(); } } });
    function ensure(){ if(panel) return panel; ensureStyle(); panel=document.createElement('div'); panel.id='atlas-panel'; panel.dataset.nodock='1';   /* ⚠⚠⚠ (#R242) ATLAS IS NEVER DOCKED, and the flag is written HERE, where the panel is born: #R238 wrote it in window-manager's applyDockMode(), which runs at boot while this lazy panel does not exist — so a reader whose SAVED setting is 「まとめる」 had #atlas-panel re-parented into #docked-feed with .im-docked (measured; the class survived mountTab and collapsed .atl-chat to nothing). 「元に戻せ」 */
      panel.innerHTML='<div class="atl-head"><span class="atl-title">Atlas <span class="atl-beta">beta</span></span><span class="atl-btns"><button class="atl-min-btn" title="'+L('Minimize','最小化','Minimieren','Свернуть','Minimizar')+'">–</button><button class="atl-x" title="'+t('close')+'">×</button></span></div>'
        +'<div class="atl-sub">'+L('Ask in plain language — Atlas drives the map for you. Try:','自然言語で指示すると、Atlasが地図を操作します。例:','Stell deine Anfrage in normaler Sprache — Atlas steuert die Karte. Beispiele:','Спросите обычными словами — Atlas управляет картой. Примеры:','Pide en lenguaje natural — Atlas controla el mapa. Ejemplos:')+'</div>'
        +'<div class="atl-ex"></div>'
        +'<div class="atl-chat"></div>'
        +'<div class="atl-imgrow" style="display:none;"></div>'   /* (#R149) pasted/attached image thumbnails + (#R158) file chips appear here */
        +'<div class="atl-inbar"><button class="atl-attach" title="'+L('Attach a file (image, PDF, document or text)','ファイルを添付（画像・PDF・文書・テキスト）','Datei anhängen (Bild, PDF, Dokument oder Text)','Прикрепить файл (изображение, PDF, документ или текст)','Adjuntar archivo (imagen, PDF, documento o texto)')+'" aria-label="'+L('Attach a file','ファイルを添付','Datei anhängen','Прикрепить файл','Adjuntar archivo')+'"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button><textarea class="atl-in" rows="1" placeholder="'+L('Ask Atlas anything…','Atlasに指示…','Atlas fragen…','Спросить Atlas…','Pregunta a Atlas…')+'"></textarea><button class="atl-mic" title="'+L('Voice input','音声入力','Spracheingabe','Голосовой ввод','Entrada de voz')+'" aria-label="'+L('Voice input','音声入力','Spracheingabe','Голосовой ввод','Entrada de voz')+'"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/></svg></button><button class="atl-go idle" title="'+L('Send','送信','Senden','Отправить','Enviar')+'"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg></button></div>'
        +'<div class="atl-ainote">'+L('Atlas can be inaccurate — verify important facts.','Atlasの回答は不正確な場合があります。重要な情報は確認してください。','Atlas kann ungenau sein — wichtige Fakten prüfen.','Atlas может ошибаться — проверяйте важные факты.','Atlas puede equivocarse — verifica los datos importantes.')+'</div>'
        +'<button class="atl-jump" title="'+L('Jump to latest','最新へ移動','Zum Neuesten','К последнему','Ir al final')+'"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m5.5 12.5 6.5 6.5 6.5-6.5"/></svg></button>';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      chatEl=panel.querySelector('.atl-chat'); inEl=panel.querySelector('.atl-in'); try{ GLOSS.wire(panel); }catch(_){}   /* (#R491) one delegated listener per gesture, for every message the panel will ever hold */
      try{ const _cl=()=>L('Close','閉じる','Schließen','Закрыть','Cerrar'), _fs=()=>attachViewStrings(L); attachLightbox(chatEl,_cl,_fs); attachLightbox(panel.querySelector('.atl-imgrow'),_cl,_fs); }catch(_){}   /* (#R232) 送信後の吹き出しと、(#R773) 送る前のコンポーザ——同じ委譲を 2 つの入れ物に貼るだけで、開き方は 1 つ */
      /* (#R79g) auto-scroll so a reply that REPLACES the "thinking" dots stays visible ("返答が短いものであれば返答に合わせて自動的に最下部までスクロール"). A MutationObserver covers every
         reply-setting path; it only moves when the reader is already near the bottom, so a SHORT reply drops fully into view while a LONG one keeps its TOP where the dots were and is read from the start.
         ⚠⚠⚠ (#R775) …AND THAT SECOND HALF ANCHORED TO A PIXEL, while the content ABOVE the reply keeps changing height: the progress trace collapses to one line when the turn ends, images and cards
         finish loading. Measured on production 2026-09-17 with a 3,075px reply — the reply began at 7,900 and `scrollTop` sat at 7,050, i.e. 745px ABOVE the reader's OWN question at 7,795: neither the question nor one line of the answer was on screen when the turn finished. An ELEMENT says what #R79g meant and keeps saying it while the page settles. ⚠ The near-bottom test still owns the short reply; `_anc` is consulted only when it fails, declines when the question is already in view, and declines again when the reader has scrolled far away by hand (nothing is ever yanked back). */
      try{ const _nb=()=>chatEl.scrollHeight-chatEl.scrollTop-chatEl.clientHeight<150;
        const _anc=()=>{ const bs=chatEl.querySelectorAll('.atl-b.u'), u=bs[bs.length-1]; if(!u) return; const top=u.offsetTop, v=chatEl.scrollTop; if((top>=v-4&&top<v+chatEl.clientHeight)||top<v-chatEl.clientHeight*3) return; chatEl.scrollTop=Math.max(0,top-6); };
        new MutationObserver(()=>{ try{ if(_nb()) chatEl.scrollTop=chatEl.scrollHeight; else _anc(); }catch(_){} }).observe(chatEl,{childList:true,subtree:true,characterData:true}); }catch(_){}
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
        const atk=panel.querySelector('.atl-attach'); if(atk) atk.onclick=()=>{ try{ const fi=document.createElement('input'); fi.type='file'; fi.multiple=true; fi.style.display='none'; fi.setAttribute('aria-label',atk.getAttribute('title')||''); fi.onchange=()=>{ try{ _atlAddFiles([...(fi.files||[])]); }catch(_){} try{ fi.remove(); }catch(_){} }; document.body.appendChild(fi); fi.click(); }catch(_){} };   /* (#R158) no accept restriction — images + text files both allowed */
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
          const ai=_pend(bubble('a',stageDots('think')),'think'); const gen=++_runGen;
          runActions(ai,'',[act],gen).then(()=>{ try{ PROG.done(ai); }catch(_){} },()=>{ try{ PROG.done(ai); }catch(_){} }); return; }
        const tjb=e.target.closest&&e.target.closest('.atl-traj-btn[data-traj]');
        if(tjb&&_lastMissileCtx){ const m=tjb.getAttribute('data-traj'); const c2=_lastMissileCtx;   /* (#R85) re-fly the shot on the chosen trajectory profile */
          const act={type:'missile',from:c2.from,to:c2.to,missile:c2.missile,yield:c2.yieldKt,marv:c2.marv};
          if(m==='marv') act.marv=!c2.marv; else act.loft=m;
          const ai=_pend(bubble('a',stageDots('think')),'think'); const gen=++_runGen;
          runActions(ai,'',[act],gen).then(()=>{ try{ PROG.done(ai); }catch(_){} },()=>{ try{ PROG.done(ai); }catch(_){} }); return; }
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
        const ai=_pend(bubble('a',stageDots('think')),'think'); const gen=++_runGen;
        runActions(ai,'',[act],gen).then(()=>{ try{ PROG.done(ai); }catch(_){} },()=>{ try{ PROG.done(ai); }catch(_){} });
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
      const imgH=_atlImgs.map((u,i)=>'<div class="atl-thumb"><img src="'+esc(IntMapSafe.url(u,{allowData:true}))+'" alt=""><button class="atl-thumb-x" data-kind="img" data-i="'+i+'" title="'+rm+'">×</button></div>').join('');
      const fileH=_atlFiles.map((f,i)=>'<div class="atl-fchip" data-atlvid="'+esc(ATTACH_STORE.put(f))+'" title="'+esc(f.name)+((f.size)?(' · '+atlFmtBytes(f.size)):'')+'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span class="atl-fchip-n">'+esc(f.name)+'</span><button class="atl-thumb-x atl-fchip-x" data-kind="file" data-i="'+i+'" title="'+rm+'">×</button></div>').join('');
      row.style.display='flex'; row.innerHTML=imgH+fileH;
      row.querySelectorAll('.atl-thumb-x').forEach(b=>{ b.onclick=()=>{ const k=b.getAttribute('data-kind'), i=+b.getAttribute('data-i');
        if(k==='file'){ if(i>=0&&i<_atlFiles.length){ try{ ATTACH_STORE.drop(_atlFiles[i]); }catch(_){} _atlFiles.splice(i,1); } } else { if(i>=0&&i<_atlImgs.length) _atlImgs.splice(i,1); }   /* (#R773) drop: 送る前に外された添付は、誰も開けないので預かり続けない */
        _atlRenderImgs(); _atlSyncGo(); }; });
    }catch(_){} }
    function _atlSyncGo(){ try{ if(!panel) return; const go=panel.querySelector('.atl-go'); if(!go||go.classList.contains('busy')) return; go.classList.toggle('idle', !((inEl&&inEl.value.trim())||_atlImgs.length||_atlFiles.length)); }catch(_){} }
    async function _atlAddFiles(files){ try{ files=[...(files||[])].filter(Boolean); if(!files.length) return; let bad=null; const nOf=(k)=>_atlFiles.filter(x=>x&&x.kind===k).length;
      /* (#R156) HI-FIDELITY encode for OCR/math: 1100px/q0.72 dissolved small text, fraction bars and subscripts; 2000px/q0.9 keeps them, and with detail:"high" server-side it reads dense documents. ⚠ (#R540) IT IS ALSO THE TEST OF WHETHER THIS IS AN IMAGE AT ALL — a format this canvas cannot draw returns nothing, and the reader is TOLD, instead of the picture vanishing silently between here and the provider's four accepted rasters. */
      for(const f of files){ const d=await ATL_FILE.read(f,{encodeImage:(x)=>compressImage(x,2000,0.9)});
        if(d.kind==='image'){ if(_atlImgs.length>=ATL_FILE.LIMITS.images){ try{ aiToast(L('Up to 4 images per message','1メッセージにつき画像は4枚まで','Bis zu 4 Bilder pro Nachricht','До 4 изображений на сообщение','Hasta 4 imágenes por mensaje')); }catch(_){} continue; } _atlImgs.push(d.dataUrl); }
        else if(d.kind==='doc'){ const _tot=_atlFiles.reduce((n,x)=>n+((x&&x.kind==='doc')?(x.size||0):0),0); if(_tot+(d.size||0)>ATL_FILE.LIMITS.docsBytes){ try{ aiToast(_atlWhy({why:'docs-total'})); }catch(_){} continue; } if(nOf('doc')>=ATL_FILE.LIMITS.docs){ try{ aiToast(L('Up to 4 documents per message','1メッセージにつき文書は4件まで','Bis zu 4 Dokumente pro Nachricht','До 4 документов на сообщение','Hasta 4 documentos por mensaje')); }catch(_){} continue; } _atlFiles.push(d); }
        else if(d.kind==='text'){ if(nOf('text')>=ATL_FILE.LIMITS.files){ try{ aiToast(L('Up to 8 files per message','1メッセージにつきファイルは8件まで','Bis zu 8 Dateien pro Nachricht','До 8 файлов на сообщение','Hasta 8 archivos por mensaje')); }catch(_){} continue; } _atlFiles.push(d); }
        else bad=d; }
      if(bad){ try{ aiToast(_atlWhy(bad)); }catch(_){} }
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
    /* (#R733) the answer above is where the turn RAN OUT, not where it finished. See _atlCompose. */
    function _cutNote(){ return '<div style="margin-top:6px;color:var(--text-muted);font-size:11.5px;">'+esc(L('This turn reached its working limit, so the answer above may be incomplete — anything asked for that is not described above was not done. Ask again for the missing part on its own.','このターンは作業の上限に達したため、上の回答は途中までの可能性があります——上に書かれていないことは実行されていません。足りない部分だけをもう一度指示してください。','Dieser Zug hat sein Arbeitslimit erreicht; die Antwort oben kann unvollständig sein — was oben nicht beschrieben ist, wurde nicht getan. Frag den fehlenden Teil einzeln nach.','Этот ход достиг рабочего предела, поэтому ответ выше может быть неполным — всё, что не описано выше, не было сделано. Спросите недостающее отдельно.','Este turno alcanzó su límite de trabajo, así que la respuesta puede estar incompleta — lo que no se describe arriba no se hizo. Pide la parte que falta por separado.'))+'</div>'; }
    function _cancelledNote(){ return '<span style="color:var(--text-muted);font-size:11.5px;">⏹ '+esc(L('Stopped','停止しました','Angehalten','Остановлено','Detenido'))+'</span>'; } function _markCancelled(b){ TCONT.markCancelled(b,_cancelledNote()); try{ PROG.done(b); }catch(_){} }   /* ⚠ (#R723) THE ORDER IS THE POINT: markCancelled REPLACES the live word with the Stopped note, and PROG.done takes that word away. Done first and the note would be appended below instead of standing where the work stopped. */   /* ⚠ (#R419) STOPPING A TURN IS NOT ERASING WHAT IT ALREADY DREW — every cancel path below used to paint this over the WHOLE bubble, which is how the reported transcript lost the three questions the reader had just answered. js/atlas-turn-continuity.js has the measurement. */
    const _GO_SEND_SVG='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg>';
    const _GO_STOP_SVG='<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4.25" y="4.25" width="15.5" height="15.5" rx="3.4" fill="currentColor"/></svg>';   /* (#R150) "四角はほんの少し小さく": rect 17.5→15.5 in a 24 viewBox (rendered ≈14.6px→12.9px) — a gentle trim, still clearly a Stop square */
    /* (#R142) send ⇄ stop: while Atlas is generating a reply, the up-arrow SEND button becomes a red STOP square. */
    function _setGoBusy(busy){ try{ if(!panel) return; const go=panel.querySelector('.atl-go'); if(!go) return;
      if(busy){ go.classList.add('busy'); go.classList.remove('idle'); go.innerHTML=_GO_STOP_SVG; go.onclick=_stopRun; go.title=L('Stop answering','応答を停止','Antwort stoppen','Остановить ответ','Detener respuesta'); go.setAttribute('aria-label',go.title); }
      else { go.classList.remove('busy'); go.innerHTML=_GO_SEND_SVG; go.onclick=fire; try{ go.classList.toggle('idle',!(inEl&&inEl.value.trim())); }catch(_){} go.title=L('Send','送信','Senden','Отправить','Enviar'); go.setAttribute('aria-label',go.title); } }catch(_){} }
    /* (#R142) STOP: supersede the running turn (bump _runGen so its late results are discarded — the existing soft-cancel)
       AND abort the in-flight request (real fetch AbortController), then paint the neutral Stopped note immediately. */
    function _stopRun(){ try{ _runGen++; }catch(_){} try{ if(_abortCtl&&_abortCtl.abort) _abortCtl.abort(); }catch(_){} _abortCtl=null;
      try{ if(chatEl) chatEl.querySelectorAll('.atl-b.a .atl-stage').forEach(d=>{ const b=d.closest('.atl-b'); if(b) _markCancelled(b); }); }catch(_){}
      try{ _setGoBusy(false); }catch(_){} }
    /* (#R84) MAP-OVERLAY TOGGLE ("Atlasによって地図上にマッピングされた類のものは、Atlasのメッセージ内から
       オンオフできるように"): a reply that painted something on the map gets a live on/off switch. */
    /* ══ (atlas-one-declaration) WHAT A CHIP SWITCHES IS WHAT THE PAINTER CLAIMED ═══════════════════════════════════
       A kind named by an EFFECT KEY ('map.isochrone', 'map.route', …) switches the layers in the style that read a source its
       painter claimed under that key (js/geo-engine.js render.claim) — the same fact the capability observers read
       (js/atlas-capabilities.js ownSurfaces / paintNow). This table used to type those layer ids a second time, and a typed id
       list beside a claim is the #R736 shape: the copy drifts. Measured when it was replaced: the line-of-sight row named three
       layers no file creates (los-cover, los-shadow, los-cover-line) and missed the three the tool draws; the radiation row
       missed imrad-dep-line.
       ⚠ WHAT IS STILL LISTED, AND WHY — each row goes the day its painter claims:
         · highlight, choropleth, lines — a SUBSET of the one shared source nlq-src, painted by feature-state; a claim is per
           source, so it would switch the three together. Per-layer attribution is js/geo-engine.js's contract to extend.
         · outline, isolate — js/map-tools.js; claiming them changes what the `paint` verdict reads for map.outline and
           map.isolateCountry, which is its own decision.
         · pin — js/app-body.js's user pins.
         · streetview — sv-here-pt / sv-here-cone are created by no file today (js/street-view.js draws sv-cov-*); kept, not
           deleted, because removing it is a separate, confirmed step.
         · 'map.route' — the two analyses js/routing-ops.js draws, ADDED to what js/routing.js claims under the same key.
       ⚠ ONE LIST — _ovlVisible / overlayToggle / _ovlSnapshot / _ovlRestore / the clones read _ovlIds(), never this table. */
    const _OVL={ highlight:['nlq-fill','nlq-line','nlq-poly-fill','nlq-poly-line'], choropleth:['nlq-choro'], lines:['nlq-line'], outline:['pl-outline-fill','pl-outline-line'],
      /* ⚠ (#R299) switching a journey OFF has to take routing-ops' two analyses with it, as it takes the waypoints, leg times, the
         keep-out and the invisible pick target `imroute-hit` (js/routing.js claims those). */
      'map.route':['imroute-diff','imroute-hist'],
      /* (#R85) close the "できないものもある" gap — isolate mask, pins and street-view marker were painted but had no in-message on/off. */
      isolate:['iso-mask'], pin:['user-pin-dot','user-pin-shadow'], streetview:['sv-here-pt','sv-here-cone'] };
    function _ovlIds(kind){ if(kind==='arc') return []; const own=_OVL[kind]||[];
      let src=[]; try{ const r=GE().render.drawn({owners:[kind]}); src=Object.keys((r&&r.surfaces)||{}); }catch(_){} if(!src.length) return own;
      let ls=[]; try{ ls=(GE().scene.getStyle()||{}).layers||[]; }catch(_){}
      return own.concat(ls.filter(l=>l&&l.source&&src.indexOf(l.source)>=0&&own.indexOf(l.id)<0).map(l=>l.id)); }
    /* which kinds a capability's result switches, BY CAPABILITY ID — every spelling of it arrives through its row (CAPS.ofSpelling),
       so no spelling is written here. It used to be 81 spellings, and it knew `viewshed` but not `rfCoverage` — the one the tool
       surface sends — nor `trajectory`, `transitRoute`, `facilities`, `extent`, `newsEvents`, `airports`.
       ⚠ sim.ballistic keeps map.fly as its own kind: the trajectory is also the fly kind's surface, and a later fly call taking
       it over must still turn this chip OFF (#R122), which is the per-kind ownership below.
       ⚠ sim.rfCoverage switches the line-of-sight kind because that is what it switched before; its own painter claims nothing. */
    const OVL_OF={ 'map.highlight':'highlight', 'map.choropleth':'choropleth', 'map.poi':'map.poi', 'map.elevationHighlight':'map.elevation', 'research.historicalMap':'map.factions',
      'sim.radiation':'map.radiation', 'routing.route':'map.route', 'sim.ballistic':['arc','map.fly','map.ballistic'],   /* (#R142) include the blast ring so a strike's blast overlay also gets a map on/off chip (#9) */
      'sim.flyAnimate':'map.fly', 'sim.lineOfSight':'map.los', 'sim.rfCoverage':'map.los', 'map.isolateCountry':'isolate', 'map.pin':'pin', 'view.locate':'pin', 'panel.streetView':'streetview',
      'data.compareStats':'panel.compare', 'map.drawLine':'lines', 'map.outline':'outline', 'research.mapReport':'map.poi', 'research.situationMap':'map.poi', 'research.events':'map.poi', 'research.impact':'map.poi', 'data.runways':'map.poi',
      'routing.isochrone':'map.isochrone', 'map.compose':'map.compose', 'map.shakemap':'map.shakemap', 'map.outbreaks':'map.outbreaks' };   /* (#R511) (#R650) */
    function _ovlOf(t){ const c=CAPS.ofSpelling(t); return c?(OVL_OF[c.id]||null):null; }
    function _ovlVisible(kind){ if(kind==='arc'){ const cv=document.getElementById('arc3d-canvas'); return !!(cv&&cv.parentNode&&cv.style.display!=='none'); } const ids=_ovlIds(kind); for(const id of ids){ try{ if(GE().layers.has(id)&&GE().layers.getLayout(id,'visibility')!=='none') return true; }catch(_){} } return false; }
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
      const ids=_ovlIds(kind); if(show===undefined) show=!_ovlVisible(kind); ids.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',show?'visible':'none'); }catch(_){} }); return show; }
    /* (#R118) PER-MESSAGE overlay snapshots — the reported bug: every "Shown on the map" switch flipped the SHARED
       nlq-* layers, i.e. an old message's switch controlled whatever was drawn LAST ("そのメッセージのものではなく
       強制的に最新のもの"). Each reply now stores WHAT IT DREW (geojson source data + layer filter + key paint
       props) at reply time; turning its switch ON restores that content to the map (and dims other messages'
       same-kind switches, since the shared canvas now shows THIS message's result). Old replies without a
       snapshot keep the previous plain show/hide behaviour. */
    const _OVL_PAINT=['fill-color','fill-opacity','line-color','line-width','line-opacity','circle-color','circle-radius','circle-opacity'];
    function _ovlSnapshot(kinds){ const snap={}; (kinds||[]).forEach(kind=>{ if(kind==='arc') return; const ids=_ovlIds(kind); const S={sources:{},layers:{}};
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
        const kid='atlm'+bEl.__atlmId+'-'+kind, ids=_ovlIds(kind);
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
      tempWindParticles:{ lbl:()=>L('Wind particles over the temperature layer','気温レイヤー上の風のパーティクル','Wind-Partikel über der Temperaturschicht','Частицы ветра поверх слоя температуры','Partículas de viento sobre la capa de temperatura'), on:()=>{ try{ return !!(window._imWxTempParts&&window._imWxTempParts()); }catch(_){ return false; } }, set:v=>{ try{ window._imWxTempParts&&window._imWxTempParts(!!v); }catch(_){} } },      gustWindParticles:{ lbl:()=>L('Wind particles over the gust layer','最大瞬間風速レイヤー上の風のパーティクル','Wind-Partikel über der Böenschicht','Частицы ветра поверх слоя порывов','Partículas de viento sobre la capa de rachas'), on:()=>{ try{ return !!(window._imWxParts&&window._imWxParts('ec-gust')); }catch(_){ return false; } }, set:v=>{ try{ window._imWxParts&&window._imWxParts('ec-gust',!!v); }catch(_){} } },      slpWindParticles:{ lbl:()=>L('Wind particles over the pressure layer','気圧レイヤー上の風のパーティクル','Wind-Partikel über der Druckschicht','Частицы ветра поверх слоя давления','Partículas de viento sobre la capa de presión'), on:()=>{ try{ return !!(window._imWxParts&&window._imWxParts('ec-slp')); }catch(_){ return false; } }, set:v=>{ try{ window._imWxParts&&window._imWxParts('ec-slp',!!v); }catch(_){} } },      precipWindParticles:{ lbl:()=>L('Wind particles over the precipitation layer','降水量レイヤー上の風のパーティクル','Wind-Partikel über der Niederschlagsschicht','Частицы ветра поверх слоя осадков','Partículas de viento sobre la capa de precipitación'), on:()=>{ try{ return !!(window._imWxParts&&window._imWxParts('ec-precip')); }catch(_){ return false; } }, set:v=>{ try{ window._imWxParts&&window._imWxParts('ec-precip',!!v); }catch(_){} } },      isobars:{ lbl:()=>L('Isobars','等圧線','Isobaren','Изобары','Isobaras'), on:()=>{ try{ return !!(window._imWxIsobars&&window._imWxIsobars()); }catch(_){ return false; } }, set:v=>{ try{ window._imWxIsobars&&window._imWxIsobars(!!v); }catch(_){} } },
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
    function mapToggleChip(kinds){ const K=Array.from(new Set((kinds||[]).filter(k=>k==='arc'||_ovlIds(k).length))); if(!K.length) return '';
      return '<div class="atl-mapctl atl-ctl-row" data-ovls="'+esc(K.join(','))+'" style="margin:7px 0 1px;"><span class="atl-ctl-lbl">'+L('Shown on the map','地図に表示中','Auf der Karte','Показано на карте','En el mapa')+'</span>'
        +'<button class="atl-ctl-toggle atl-map-toggle on" role="switch" aria-checked="true" title="'+L('Show / hide on the map','地図で表示 / 非表示','Auf der Karte ein/aus','Показать/скрыть на карте','Mostrar/ocultar en el mapa')+'"><span class="atl-ctl-knob"></span></button></div>'; }
    /* (#R723) THE WORK TRACE — js/atlas-progress.js, which is where the indicator's whole story now is.
       What stood here: ONE WORD that overwrote itself, so a six-step turn showed one word at a time and
       left no trace of the other five — and WHICH word came from `_STAGE_OF(a)`, a hand-written list of
       about thirty legacy `type` spellings with `return 'think'` for everything else. Measured against
       the registry's 138 rows it named 29: THE OTHER 109 SAID 「考え中」 WHILE DOING SOMETHING ELSE.
       The word now comes from the capability's own category, and what already happened stays on screen.
       ⚠ `.atl-stage` KEEPS BOTH OF ITS #R313 JOBS — the shimmering label AND the marker meaning 「this
       bubble is still working」 that this file's cancel scan and js/atlas-turn-continuity.js both read.
       The three names below are the same three this file called before, so no call site changed. */
    const PROG=makeAtlasProgress(HOST,{L,esc,capabilities:()=>CAPS,schemas:()=>SCHEMAS});   /* (#R725) the schemas say which argument is the SUBJECT and which is a setting — production measured the hand-written key list showing nothing at all */
    function stageDots(k){ return PROG.stageHtml(k); } 
    const _pend=(b,k)=>{ try{ PROG.open(b); PROG.watch(EXEC); PROG.phase(b,k); }catch(_){} return b; };   /* a pending reply: the trace above it, the live word inside it */
    /* (#R159) ── COMPOSITE-ANSWER INTEGRATION ─────────────────────────────────────────────────────────────────
       One request must produce ONE final answer — not the first (failed) analysis and the repaired analysis stacked
       with a divider, contradicting each other. runActions now RECORDS each action's result on the bubble
       (ai.__atlResults) instead of blindly concatenating html, and _atlCompose() renders from that list keeping only
       the BEST result per research/answer GOAL. The repair pass re-runs into the SAME bubble (no divider, no second
       answer) and its answer inherits the failed original's goal key, so a successful repair REPLACES the failure
       rather than piling on. Map-only failure never fails the written analysis (the dispatch already returns ok:true
       for that), and the fail summary no longer leaks internal action names / error codes / repair counts. */
    function _atlCompose(ai){ try{
      const results=(ai&&ai.__atlResults)||[]; const say=(ai&&ai.__atlSay)||'';
      /* 1) DEDUPE BY GOAL — the single best result per answer family (original vs repair vs same-topic retry), AND
         ⚠ (#R441) the LATEST of a REPEATED OPERATION. The second half is new and it is why the reported reply listed
         the same five itineraries twice: the only guard an operational action had was the exact-HTML comparison in
         step 3, and js/routing.js stamps every computed set with a fresh `rs<n>` that js/routing-cards.js writes into
         every card, so two runs of one journey are never byte-equal. js/atlas-turn-results.js names the OPERATION. */
      const keep=TRES.keep(results);
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
      /* 4) head — ATLAS'S ANSWER, written after the results (js/atlas-agent.js) and therefore
         never a claim about something that did not happen. It is no longer suppressed on failure:
         the old `say` was written BEFORE execution, so a failed turn had to hide it; this text was
         composed knowing what failed and is the honest account of it. ⚠ AND THE COUNTED-FAILURE
         BANNERS ARE GONE WITH IT — 「実行できなかった操作が N 件あります」 counted actions, never
         asking whose goal each served, and #R406 gives that judgement back to the one thing that
         knows the reader's goal. What could not be done is said in the answer, in words.
         ⚠ NOT HIDDEN: each action's own body still renders its honest per-action outcome below. */
      let head=say?('<div style="margin-bottom:6px;">'+mdMini(say)+'</div>'):''; try{ const _cr=COMPOSE.recordsFor(keep); if(_cr.length&&head) head=COMPOSE.linkProse(head,_cr); if(head) head=ARENDER.demoteProseLinks(head,_curPlanCites,_cr); }catch(_){}   /* (#R511) the names in the answer get the numbers the markers carry — from the records THIS reply drew, read off its own results. ⚠⚠⚠ (#R589) AND AN ANCHOR IN THAT PROSE CLAIMS INTMAP FETCHED THE PAGE: the structured path builds every link from the registry, this one renders what Atlas wrote, which is how 「(mapion.co.jp)」 shipped as a live link to a page nothing in the turn had requested. The rule, and the set of hosts this turn actually retrieved, are js/atlas-answer-render.js. */
      if(ai.__atlCancelled) head=_cancelledNote()+head;
      /* ⚠⚠⚠ (#R733) A TURN THAT RAN OUT IS NOT A TURN THAT FINISHED, and only IntMap knows which it was:
         js/atlas-agent.js stops for two reasons that are not Atlas deciding it is done, and neither reaches
         the model. Measured, three production turns ended `stopped:'step_budget'` reading as finished answers
         — one promised a highlight, never called it, and closed without a word. Architecture.md has the rest. */
      if(ai.__atlCut) head=head+_cutNote();
      ai.innerHTML=(head+body)||esc(L('Done.','完了しました。','Fertig.','Готово.','Hecho.')); try{ PROG.live(ai); }catch(_){}   /* ⚠ (#R723) THIS LINE IS WHY THE INDICATOR DIED AFTER THE FIRST TOOL: it assigns innerHTML, and `.atl-stage` is both the word and the marker the cancel scan needs. See PROG.live. */
      try{ _refreshMapChips(); }catch(_){}   /* (#R122) sync every map-toggle chip's on/off to real ownership+visibility */ try{ COMPOSE.bind(ai); }catch(_){}   /* (#R511) hover a name → its marker rings; hover the marker → the name lights */
    }catch(e){ try{ ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; }catch(_){} } }
    async function runActions(ai, say, acts, gen){
      const results=[]; const fails=[]; let cancelled=false;
      for(const a of acts){ if(gen!=null&&gen!==_runGen){ cancelled=true; break; }
        try{ a.__paintRun="run"+(gen!=null?gen:_runGen); }catch(_){}   /* ⚠ (#R489) WHICH RUN THIS ACTION BELONGS TO, stamped on the action rather than held as a flag. The painting paths accumulate within ONE run and replace between runs, and this is what tells them apart with no lifecycle to get wrong: an action reached through IntMapOS.dispatch (the diagnostics door, and the door tests/r157.spec.js uses) carries no stamp, so it REPLACES — which is right, because a bare dispatch is its own request. */
        try{ PROG.step(ai,a); }catch(_){}   /* (#R723) the ARGUMENT for the row the executor is about to open — the row itself is opened by the event, so a capability no call site here has heard of still appears */
        /* ══ (#R318) THROUGH THE KERNEL, NOT STRAIGHT AT THE ENGINE ════════════════════════════
           This line used to be `r=await dispatch(a)` — call the case, believe what it says. The case
           still does all the engine work; what is new is the eleven steps around it (availability,
           argument validation, a REFUSAL to invent a missing target, an observation of the app
           before and after, and a postcondition). `toLegacy` puts the verdict back into the shape
           `_atlCompose` and the repair loop already read, so nothing downstream had to change —
           except that `ok` is now something the app watched happen. */
        let r, _ar=null;
        try{ const _cap=CAPS.resolve(a.type); const _args={}; Object.keys(a).forEach(k=>{ if(k!=='type'&&k.slice(0,2)!=='__') _args[k]=a[k]; });
          _ar=await EXEC.execute(_cap?_cap.id:a.type, _args, {source:'atlas', turnId:_curTurn, externalContent:a.__externalContent===true, confirmed:_confirmedBy(_cap?_cap.id:a.type,_args), signal:(_abortCtl?_abortCtl.signal:undefined)});   /* (#R801) two facts as execution context, never arguments: whether outside content has been in front of the model this turn (`_runOne` stamps it from js/atlas-agent.js's turn record; a chip or a replay carries no stamp and reads false), and whether THIS call is the reader's answer to a confirmation asked in an earlier turn. js/atlas-executor.js 4b reads both */
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
        if(_ar&&_ar.status==='needs_input'&&_ar.inputRequest){ _pendingInput={ result:_ar, bubble:ai, at:Date.now(), turn:_curTurn }; }   /* (#R801) `turn`: a confirmation is answered in a LATER turn — the same call in the same turn is not the reader speaking */
        if(r.ok===false&&!(_ar&&(_ar.status==='needs_input'||_ar.status==='running'))) fails.push(a);
        results.push({act:a, ok:r.ok!==false, html:r.html||'', meta:(r&&r.meta)||null});   /* (#R159) per-action result → _atlCompose de-dupes by goal so repair REPLACES a failure instead of appending */
        try{ if(r&&r.meta) a.__meta=r.meta; if(r&&r.exec) a.__exec=r.exec;   /* (#R158) mechanical execution result → fed back to Terra by the repair loop */
          if(_atlasOutcomes) _atlasOutcomes.push({type:a&&a.type,label:actLabel(a),ok:r.ok!==false,code:(r&&r.meta&&r.meta.code)||'',semanticTarget:(r&&r.meta&&r.meta.semanticTarget)||'',temporalMode:(r&&r.meta&&r.meta.temporalMode)||'',produced:(r&&r.meta&&r.meta.produced)||[],userGoalSatisfied:(r&&r.meta&&r.meta.userGoalSatisfied)}); }catch(_){}   /* (#R135) structured per-action outcome → repair + goal validation + debug */
        if(r.objectIds&&r.objectIds.length){ try{ _wctx.lastObjects=r.objectIds.concat(_wctx.lastObjects||[]).slice(0,6); }catch(_){} } }   /* (#R119) "さっき作ったやつ" resolves to these */
      try{ const mapped=[]; acts.forEach(a=>{ if(fails.indexOf(a)>=0) return; let ks=_ovlOf(a&&a.type); if(!ks) return; if(!Array.isArray(ks)) ks=[ks]; ks.forEach(k=>{ if(k&&_ovlVisible(k)&&mapped.indexOf(k)<0) mapped.push(k); }); });
        if(mapped.length){ try{ ai.__ovlSnap=Object.assign(ai.__ovlSnap||{}, _ovlSnapshot(mapped)); try{ ai.__viewSnap=ASTATE.snapshot({only:['camera','time','activeLayers']}); }catch(_){}   /* ⚠ (#R543) THE VIEW THE SHAPES WERE DRAWN IN, alongside the shapes. The overlay snapshot has existed since #R118 and the chip repaints it, but it never carried where the camera was or WHAT THE CLOCK WAS SET TO — so a reply about 1950 was repainted over whatever year the reader had since moved to, which is a different claim, not that reply's map. `ASTATE.snapshot` is the observer that already reads these three sections, so capture cannot drift from what the state block reports. js/atlas-msg-tools.js puts it back. */ mapped.forEach(k=>{
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
      if(gen!=null&&gen!==_runGen){ _markCancelled(ai); return fails; }
      _atlCompose(ai);
      return fails;
    }
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
    async function _atlVisionTurn(ai, q, imgs, gen, atts){
      const opts=Object.assign({task:'vision_read',effortHint:'high',imageDetail:'high',signal:(_abortCtl?_abortCtl.signal:undefined)},atts||{});   /* (#R540) the re-examination round reuses this very object, so the attachments ride along with it */
      try{ ai.innerHTML=stageDots('read'); PROG.phase(ai,'read'); }catch(_){}
      let env=null; try{ env=await askAIJSONEnvelope(_visionPrompt(q),_visionSYS(),imgs,opts); }
      catch(e){ if(gen===_runGen){ ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; recordTurn(q,'',[{type:'answer'}],[{type:'answer'}]); } return; }
      if(gen!==_runGen){ _markCancelled(ai); return; }
      let d=_visNorm(env&&env.data); let vr=_atlVerifyChecks(d.checks);
      /* ONE image RE-EXAMINATION round when a deterministic recompute failed (the work order's "検算失敗時は回答をそのまま
         返さず、転記または計算を再確認する") — the model is told exactly which check broke and to re-read that region. */
      if(vr.ran && vr.failed.length){ try{ if(gen===_runGen){ ai.innerHTML=stageDots('verify'); PROG.phase(ai,'verify'); }
        const guide='\n\n[SELF-CHECK FAILED] Your emitted check(s) did NOT hold when recomputed EXACTLY on the client: '+vr.failed.map(f=>f.label+' ('+f.detail+')').join('; ')+'. RE-EXAMINE the corresponding region of the image, re-transcribe those exact entries (watch 1/7, 0/O, signs and fraction bars), redo the computation, and return corrected JSON whose checks actually pass. If the image genuinely does not support a passing check, say so honestly in "answer" and omit the failing check.';
        const env2=await askAIJSONEnvelope(_visionPrompt(q)+guide,_visionSYS(),imgs,opts);
        if(gen!==_runGen){ _markCancelled(ai); return; }
        if(env2&&env2.data){ const d2=_visNorm(env2.data); const vr2=_atlVerifyChecks(d2.checks);
          if(vr2.ran && !vr2.failed.length){ d=d2; vr=vr2; env=env2; }                               /* repaired → verified */
          else if(vr2.ran && vr2.failed.length<vr.failed.length){ d=d2; vr=vr2; env=env2; } }        /* strictly fewer failures → still an improvement */
      }catch(_){} }
      if(gen!==_runGen) return;
      let html='<div class="atl-md">'+mdMini(d.answer||L('(no answer returned)','（回答が返りませんでした）','(keine Antwort)','(нет ответа)','(sin respuesta)'))+'</div>';
      if(Array.isArray(d.uncertain)&&d.uncertain.length) html+='<div style="font-size:11px;margin-top:6px;color:var(--text-muted);"><b>'+esc(L('Uncertain in the image','画像中の判読が不確実な箇所','Im Bild unsicher','Неуверенно распознано','Incierto en la imagen'))+':</b> '+esc(d.uncertain.slice(0,8).join(', '))+'</div>';
      try{ html+=_atlChecksNoteHtml(vr); }catch(_){}
      const cls=_atlContentClass(d.contentClass);
      if(_atlShouldMap(cls)){ const cites=(env&&Array.isArray(env.citations))?env.citations:[];
        try{ html+=await _pinReplyPlaces(d.places||[],{text:String(d.answer||''),citations:cites,contentClass:cls}); }catch(_){}
        if(d.focusPlace){ try{ const g=await geocode(String(d.focusPlace)); if(g&&isFinite(+g.lng)){ if(gen===_runGen) GE().camera.flyTo({center:[+g.lng,+g.lat],zoom:Math.max(GE().camera.getZoom(),6),duration:900}); } }catch(_){} } }
      if(gen===_runGen){ ai.innerHTML=html; recordTurn(q,'',[{type:'answer',contentClass:cls}],[]); }
    }
    async function run(q,imgs,files){ q=String(q||'').trim(); imgs=(Array.isArray(imgs)?imgs:[]).filter(u=>typeof u==='string'&&/^data:image\//.test(u)).slice(0,4);   /* (#R149) optional pasted/attached images (vision) */
      files=(Array.isArray(files)?files:[]).filter(f=>f&&(f.kind==='doc'?typeof f.b64==='string':typeof f.text==='string')).slice(0,ATL_FILE.LIMITS.files+ATL_FILE.LIMITS.docs);   /* (#R158/#R540) text attachments AND provider-native documents */
      if(!q&&!imgs.length&&!files.length) return;
      /* ⚠⚠ (#R540) THE ATTACHMENTS ARE THEIR OWN CHANNELS NOW, NOT MORE PROMPT TEXT. #R158 glued them into the prompt, which ai-proxy slices at MAX_PROMPT (24,000) — so four 60,000-character files were cut mid-word with nothing said to the reader OR the model. Same shape as #R285's system prompt, same fix: a bound of their own. The bubble and history still keep only the reader's own words plus a chip. */
      /* (#R157) IMAGE-ONLY: do NOT fabricate a user message. The old default text ("Read and analyze this image…") was
         written into `q` here and then SHOWN in the user bubble + saved to history — the "勝手にテキストが添付される" the
         user found unpleasant. `q` now stays EMPTY: the user bubble shows only the image, history stores no invented
         prose, and the model gets its default instruction ONLY at the API boundary (_visionPrompt, hidden). */
      const p=ensure(); p.style.display='flex';
      const exw=p.querySelector('.atl-ex'); if(exw) exw.style.display='none'; const subw=p.querySelector('.atl-sub'); if(subw) subw.style.display='none';   /* (#R103) drop the intro sub-text once a conversation starts (don't stick it to the top) */
      _lastUserMsg=q;   /* (#R64) replies mirror the language of THIS message, not the UI setting */
      /* (#R73) a new message CANCELS any turn still thinking/executing */
      const gen=++_runGen;
      const turn=(_curTurn=++_turnSeq);   /* (#R298) the turn id every bubble and every history entry of THIS exchange carries, so an edit can rewind to exactly here */ try{ GLEDGER.beginTurn(turn); }catch(_){}   /* (#R489) …and the same id groups the places this exchange resolves. Nothing is forgotten; the counter moves. */
      try{ ATTACH_LOG.remember(turn,imgs,files); }catch(_){} _atlRecallImgs=[]; _atlSentNames=files.map(f=>String(f&&f.name||''));   /* ⚠⚠⚠ (#R773) 添付は会話に属する（1 つのメッセージではない）。ここは長らく**このメッセージの添付だけ**を組んでいて、次のターンにはファイル名すら残らなかった——だから読者が同じファイルについて続けて訊くと、モデルには本当に何も届いておらず「見られません」と正直に答えていた。理由と方針は js/atlas-attach-log.js の見出し。`_atlSentNames` は今ここに在るものを台帳が二度述べないための一覧 */ const _atts={ files:ATTACH_LOG.carry(turn,files,ATL_FILE.LIMITS), docs:files.filter(f=>f.kind==='doc').map(f=>({name:String(f.name||'file'),mime:String(f.mime||''),b64:String(f.b64||'')})) }; _atlRecallAtts=_atts;   /* (#R773) 台帳へ載せ、この回の取り寄せ枠を空にし、いま載っている名前を控える */   /* ⚠⚠⚠ (#R777) この行は `const turn` の**上**に在った——`turn` は TDZ の中なので `carry(turn,…)` が ReferenceError を投げ、本番の Atlas は**すべての送信**が死んでいた（バブルも出ず、リクエストは 1 本も出ない。添付の有無に依らない）。⚠ 行を詰める書き換えは、その文が何に依存しているかを一緒に運ばない。 */
      /* ══ (#R318) ONE TURN = ONE UNIT OF WORK ═══════════════════════════════════════════════════
         `_turnKey` identifies this exchange to the SERVER, so the planner call, the bounded repair
         calls and the vision re-read that belong to ONE user request consume ONE use of the daily
         allowance instead of up to three (§17). The server binds the key to the account and caps how
         many calls one key may carry, so a client that reuses a key gains nothing.
         `supersede` is the other half of the same idea: the previous turn's unfinished operations
         are replaced rather than left to land on top of this turn's answer (§12). */
      const _turnKey=(_curTurnKey='t'+turn+'-'+Math.floor(Date.now()/1000)); try{ EXEC.supersede(turn); }catch(_){} try{ ASTATE.beginTurn(turn,q); }catch(_){}   /* (#R298) the turn id every bubble and every history entry of THIS exchange carries, so an edit can rewind to exactly here */
      try{ chatEl.querySelectorAll('.atl-b.a .atl-stage').forEach(d=>{ const b=d.closest('.atl-b'); if(b) _markCancelled(b); }); }catch(_){}
      /* (#R231) 「画像については…吹き出しで囲わなくてそのまま表示でいい」 — the image row is its own
         element. It keeps the `u` class (_scrollUserTop reads previousElementSibling.classList) and
         `.atl-imgrow` takes the fill/padding/radius off; the 74 px square crop is gone with it.
         ⚠ FILE CHIPS STAY IN THE BUBBLE — a file is NAMED, not shown. Images-only makes no bubble. */
      if(imgs.length) bubble('u','<div class="atl-imgrow-in">'+imgs.map(u=>'<img src="'+esc(IntMapSafe.url(u,{allowData:true}))+'" alt="" loading="lazy">').join('')+'</div>',{turn:turn}).classList.add('atl-imgrow');   /* (#R298) stamped with the turn but NOT editable — a picture has no text to edit; the request bubble below carries the Edit */
      if(q||files.length) bubble('u',(files.length?'<div style="display:flex;flex-wrap:wrap;gap:5px;'+(q?'margin-bottom:6px;':'')+'">'+files.map(f=>'<span class="atl-fchip atl-fchip-msg" data-atlvid="'+esc(ATTACH_STORE.put(f))+'"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span class="atl-fchip-n">'+esc(f.name)+'</span></span>').join('')+'</div>':'')+esc(q),{turn:turn,q:q,imgs:imgs,files:files,edit:true});   /* (#R158) file chips are named, not shown, so they stay in the bubble with the text; (#R298) this bubble carries the whole request, so this is the one Edit re-runs */
      /* (#R142) generating state → the send button becomes a Stop button; a fresh AbortController lets Stop kill the
         in-flight request. The whole turn is wrapped so EVERY exit path (return / throw / early-out) restores the button. */
      _abortCtl=newTurnController(_abortCtl);   /* ⚠⚠⚠ (#R452) a second question REPLACES the first — it used to be overwritten WITHOUT being aborted, so a turn nobody would see kept running. js/atlas-deadlines.js has the measurement */
      _setGoBusy(true);
      try{
      /* ══ (#R406) ATLAS DRIVES THE TURN ═══════════════════════════════════════════════════════
         What stood here: a regex REQUEST PROFILE that decided whether the message was a question,
         a slice of a 64,250-character catalogue, ONE model call forced into {"say":…,"actions":[…]}
         — a shape with no way to say «just answer» — a validator that rewrote the actions it
         disagreed with, and up to two repair calls. Atlas committed before it had seen a single
         result, and `say` was required to state what had been done before anything was done.
         Now it chooses, watches what actually happened, and chooses again (js/atlas-agent.js).
         The sentence the reader gets is written last, by something that has read the results. */
      _atlasDbg={ toolCalls:[], rejected:0, actionOutcomes:[], steps:[], replies:[], dispatches:[] };   /* (atlas-quality-lab) `replies` and `dispatches` are the two sides of this turn as they happened — what the model said at each step and what the dispatch returned — so scripts/atlas-eval.mjs --record can save the turn as a cassette that replays with no model (scripts/atlas-eval/replay.mjs) */ _atlasOutcomes=_atlasDbg.actionOutcomes; VFRAMES.reset();   /* (#R493) a frame is a fact about a MOMENT; the previous turn's moment is gone */
      /* ⚠ (#R447) THE THIRD HAND-WRITTEN COPY OF THE QUOTA RULE STOOD HERE — a mirror of the server's counter that this page never re-read, so a wrong one ended the turn with the daily-limit message and NOT ONE request sent. aiQuotaBlocked() is the one answer, and it ASKS; missing, it fails OPEN, because ai-proxy holds the authority and refusing on a number nobody sent is the defect this replaced. */
      let _aiReady=false; try{ _aiReady = !!(typeof HOST.user!=='undefined'&&HOST.user) && !(typeof aiQuotaBlocked==='function' && await aiQuotaBlocked()); }catch(_){ _aiReady=false; }
      if(!_aiReady){
        try{ if(typeof aiGate==='function') aiGate(); }catch(_){}   /* opens the login modal / shows the daily-limit toast */
        const ai3=bubble('a',''); try{ ai3.innerHTML='<div style="font-size:12px;line-height:1.55;">'+esc((typeof HOST.user!=='undefined'&&HOST.user)?aiLimitMsg():aiLoginMsg())+'</div>'; }catch(_){} msgTools(ai3,q); return;
      }
      /* (#R156) IMAGE → the dedicated vision pipeline, which is its own reader and not this loop. */
      if(imgs.length){ const aiv=_pend(bubble('a',stageDots('read')),'read'); try{ await _atlVisionTurn(aiv,q,imgs,gen,_atts); }catch(e){ if(gen===_runGen) aiv.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; } if(gen===_runGen){ try{ PROG.done(aiv); }catch(_){} msgTools(aiv,q); } return; }
      const ai=_pend(bubble('a',stageDots('think')),'think');
      const _cplx=(q.length>80)||(((q.match(/(、|。|,|;| and | then |して|してから|した上で|それから|さらに|かつ|比較|それぞれ|全部|すべて)/g)||[]).length>=2));   /* (#R117) reasoning budget, not meaning: it picks an effort tier and decides nothing about the request */
      /* ⚠ ONE TOOL CALL BECOMES THE SAME ACTION OBJECT THE DISPATCH HAS ALWAYS RUN, so every pin,
         overlay, panel and rendering behaviour is the one that shipped — and its MECHANICAL result
         is what goes back to Atlas. */
      const _ranActions=[];
      const _runOne=async(action,turn)=>{ action.__externalContent=!!(turn&&turn.externalContentSeen); let _asked=null; try{ if(_atlasDbg) _asked=JSON.parse(JSON.stringify(action,(k,v)=>String(k).slice(0,2)==='__'?undefined:v)); }catch(_){}   /* (atlas-quality-lab) the action AS THE SURFACE BUILT IT, before the dispatch adds its own stamps — the key a replay answers it by */   /* (#R801) stamped UNCONDITIONALLY from the agent's turn record, so a `__externalContent` the model wrote into its arguments is overwritten rather than read; `__` keys never reach the executor's arguments (below) nor `callKey` */ const before=((ai.__atlResults||[]).length);
        _ranActions.push(action);
        await runActions(ai,'',[action],gen);
        const list=ai.__atlResults||[]; if(list.length<=before) return {ok:false,error:'not_run',message:'the turn was superseded'};
        let rec=null; for(let i=list.length-1;i>=before&&!rec;i--){ if(list[i]&&list[i].act===action) rec=list[i]; }   /* ⚠ (atlas-turn-engine) THIS action's record, found by identity. It was `list[list.length-1]` — the last record filed, which is this action's only while one call runs at a time; js/atlas-agent.js now runs the calls of one reply together when their conflict keys do not overlap, and another call may file its record between this one's and this line */
        if(!rec) return {ok:false,error:'not_run',message:'the turn was superseded'};
        const _ans={ ok:rec.ok!==false, html:rec.html||'', meta:rec.meta||null, exec:(rec.act&&rec.act.__exec)||null }; try{ if(_atlasDbg&&_asked) _atlasDbg.dispatches.push({ action:_asked, out:JSON.parse(JSON.stringify(_ans)) }); }catch(_){} return _ans; };
      _turnRunAction=_runOne;
      const _tools=TOOLS.baseTools();   /* (atlas-turn-engine) the same declarations every turn — nothing on the page is written into them */
      const _sys=SYS(_tools); const _c0=_agentCtx();
      /* ⚠ (atlas-turn-engine) THE REAL LAYER NAMES, AS INPUT AND AS A CHECK — NOT AS PART OF THE DECLARATION. They were set as set_layer's `name.enum`, which made the tool list (and ai-proxy's prompt-cache key, a hash of it) move whenever the page did. js/atlas-toolsurface.js liveEnum keeps them enforced (js/atlas-agent.js `reject` reads `check`) and returns the sentence that puts them in front of the model in the request item — input, after the cached prefix */
      try{ _c0.text+=TOOLS.liveEnum(_tools,'set_layer','name',layerCatalogText().split(';').map(s2=>s2.trim()).filter(Boolean)); }catch(_){}   /* (atlas-native-tools) both fixed for the turn, so every step re-sends the same prefix — see _agentCtx */
      /* ⚠⚠⚠ (atlas-native-tools) THE TRANSPORT IS NATIVE FUNCTION CALLING. What stood here said the opposite, and was
         true: ai-proxy attached `tools` only for hosted web search and parsed no function_call item, so
         every call rode a JSON envelope inside ONE string, and one step was the whole string, re-sent.
         ai-proxy protocol 2 takes the items js/atlas-agent.js composeInput builds, declares these tools
         as the provider's own functions, and returns the provider's output items; readReply turns each
         function_call into a call with its id, and the next step replays them. `webMode:'auto'` still
         means the model — not a regular expression here — decides whether this turn needs the live web.
         ⚠ (atlas-legacy-protocol-removal) THERE IS NO SECOND TRANSPORT. A page used to recognise an ai-proxy that
         predated protocol 2 by what it did and fall back, for the session, to the same items flattened into one
         string with the calls written into the JSON. Every deployed ai-proxy speaks protocol 2 on all three
         providers (scripts/release-state.mjs: 21 of 21 functions matched the source on 2026-10-01), so that path
         was reachable only by a malformed answer — which it then misread as an old server. An answer that is not
         protocol 2 is now a transport failure (js/ai-core.js aiCallServerFull), reported as one. */
      const _model=async(req)=>{ try{ PROG.phase(ai,(req&&req.final)?'write':'think'); }catch(_){}   /* ⚠ (#R723) THE PLANNER WAIT IS THE LARGEST PART OF A TURN AND IT WAS THE PART WITH NO ROW. Measured on a real six-operation turn: 57.2 s total, 13.6 s of it inside operations — the other 43 s was eight round-trips to the model, and the trace said nothing about any of them. onStep fires AFTER the reply, so it can only CLOSE a thinking row; this is the only place that knows one has started. */
        const built=_agentInput(req,q,_c0), _tImgs=_atlTurnImgs(VFRAMES.urls(),_atlRecallImgs), _o={task:'atlas_turn',files:_atts.files,docs:_atts.docs,webMode:'auto',effortHint:_cplx?'high':undefined,turnId:_turnKey,signal:(_abortCtl?_abortCtl.signal:undefined)};
        const env=await askAIJSONEnvelope('',_sys,_tImgs,Object.assign({},_o,{ protocol:2, input:built.input, schema:AGENT.FINAL_SCHEMA, toolChoice:(req&&req.final)?'none':undefined,
            tools:((req&&req.tools)||[]).concat(built.cut?[AGENT.READ_RESULT_TOOL]:[]).map(t=>({name:t.name,description:t.description,parameters:t.parameters,promoted:t.promoted?true:undefined})) }));   /* ⚠ (#R493) `_tImgs`: THE THIRD ARGUMENT WAS `null` AND IS NOW THE FRAMES — the vision channel js/ai-core.js has had since #R149 and supabase/functions/ai-proxy turns into `input_image`. Nothing new is built for it: from the step after an `inspect`, the model is reading the reader's actual screen. */   /* read_result only on a step whose input was cut: the tool list is the start of the cached prefix */
        try{ _curPlanCites=(Array.isArray(env&&env.citations)?env.citations:[]).filter(c=>c&&_atlCleanUrl(c.url)); }catch(_){ _curPlanCites=[]; }
        const _r=AGENT.readReply(env&&env.data, env&&env.text, aiParseJSON, env&&env.meta, env&&env.output); if(built.trim.droppedHistory||built.cut) _r.inputTrim=built.trim; try{ if(_atlasDbg) _atlasDbg.replies.push({ step:req&&req.step, final:!!(req&&req.final), text:String(_r.text||''), turnState:_r.turnState||'', answerMode:_r.answerMode||'', webUsed:!!_r.webUsed, toolCalls:(_r.toolCalls||[]).map(c=>({ id:c.id, name:c.name, arguments:c.arguments })) }); }catch(_){} return _r; };   /* (#R801) THIS call's meta (webUsed/webAttached), not window._aiLastMeta — the #R350 reason, one reader over. (atlas-native-tools) `output` = the provider's items; `inputTrim` = what the composer gave up, recorded in the trace by runTurn */
      try{
        const out=await AGENT.runTurn({ model:_model, tools:_tools, execute:TOOLS.makeExecute(_tools,AGENT), footprint:(c)=>TOOLS.footprintOf(c,_tools), promote:TOOLS.promotionsOf,   /* (atlas-turn-engine) which calls of one reply may run together, and what find_capability makes callable by name — js/atlas-agent.js */ externalContent:!!((_atts.files&&_atts.files.length)||(_atts.docs&&_atts.docs.length)),   /* (#R801) an attachment's text or a document is outside content in the FIRST model input — js/atlas-agent.js `turn` starts true */
          system:_sys, messages:[{role:'user',content:q}], signal:(_abortCtl?_abortCtl.signal:undefined),
          onStep:(s)=>{ try{ PROG.plan(ai,s); }catch(_){} try{ if(_atlasDbg){ _atlasDbg.steps.push(s); _atlasDbg.toolCalls=_atlasDbg.toolCalls.concat(s.calls||[]); } }catch(_){} } });   /* ⚠ (#R723) THE SECOND CALL IS THE ONE THAT WAS HERE ALONE — the only consumer of the turn's own trace was a developer diagnostics object. The reader's turn is now told to the reader. */
        if(gen!==_runGen){ try{ ASTATE.endTurn(turn,{status:'cancelled'}); }catch(_){} _markCancelled(ai); return; }
        try{ if(_atlasDbg){ _atlasDbg.rejected=(out.trace&&out.trace.rejected)||0; _atlasDbg.stopped=out.stopped; _atlasDbg.answerMode=out.answerMode||''; _atlasDbg.mapDrawn=!!out.mapDrawn; _atlasDbg.produced=(out.produced||[]).join(',')||'-'; _atlasDbg.outputGate=(out.trace&&out.trace.outputGate)||0; _atlasDbg.inputTrims=(out.trace&&out.trace.inputTrims)||[]; } }catch(_){}   /* (atlas-native-tools) inputTrims: what the composer or the proxy's fence gave up on each step — js/atlas-agent.js */   /* (#R511) what Atlas declared vs what the machine drew, and how often the final was handed back */
        /* (#R733) the two stops that are a LIMIT rather than Atlas deciding it was done — _atlCompose
           renders the note. Read off `out.stopped`, which js/atlas-agent.js sets from the guard that
           actually fired, so nothing here has to guess what was left undone. */
        try{ ai.__atlCut=({step_budget:1,call_budget:1,time_budget:1,repeated_calls:1,malformed_limit:1})[String(out.stopped||'')]===1; }catch(_){}   /* 'answered' (js/atlas-agent.js:470) is the only stop that means Atlas finished; 'aborted'/'transport'/'awaiting_user' already have their own notes */
        /* ⚠ ASSIGNED, NOT DEFAULTED. runActions seeds `__atlSay` with '' on its first pass so the
           bubble can render while tools are still running; THIS is the answer, and it arrives after. */
        /* ⚠ (#R740) A TURN THAT ASKED THE READER A QUESTION IS NOT A TURN THAT FAILED TO WRITE ONE.
           Measured in production: 「富士山の上空3000mから8000mを赤い円柱で描いて」 correctly stopped to ask for
           the radius, offered three answers with their volumes computed — and above that clean choice stood
           «Atlas ran its tools but did not write an answer this time … ask again or narrow the question.»
            is one of the stops line 4736 already calls 'has its own note'; this line simply
           did not read it. The question IS the turn's text. */
        ai.__atlSay=out.text||((String(out.stopped||'')!=='awaiting_user'&&out.results&&out.results.length)?L('Atlas ran its tools but did not write an answer this time — what they returned is shown above; ask again or narrow the question.','Atlas は道具を動かしましたが、今回は回答文を書けませんでした——道具が返したものは上に示しています。もう一度訊くか、問いを絞ってください。','Atlas hat seine Werkzeuge ausgeführt, aber diesmal keine Antwort geschrieben — was sie zurückgaben, steht oben; frag noch einmal oder enger.','Atlas запустил инструменты, но не написал ответ — их результаты выше; спросите снова или уже.','Atlas ejecutó sus herramientas pero esta vez no escribió una respuesta: lo que devolvieron está arriba; pregunta de nuevo o acota la pregunta.'):'');   /* (#R731) a turn that ran tools and wrote nothing says so — the forced final can come back machine-shaped (refused as prose in js/atlas-agent.js readReply) and the reader was left with result rows and no sentence; the sentence is IntMap's and says what happened, not what the answer would have been */
        _atlCompose(ai);
        recordTurn(q,out.text||'',_ranActions,[]); try{ ASTATE.endTurn(turn,{ reply:String(out.text||''), status:String(out.stopped||'answered'), aiCalls:((out.trace&&out.trace.steps)||[]).length }); }catch(_){}   /* ⚠ (#R760) `endTurn` had ZERO callers, so every turn IntMap ever ran stayed `status:'running'` with an empty `reply` forever — a record with no reader inside the product, and a false one to every reader outside it */
        try{ PROG.done(ai); }catch(_){} msgTools(ai,q);
      }catch(e){
        if(gen!==_runGen){ try{ ASTATE.endTurn(turn,{status:'cancelled'}); }catch(_){} _markCancelled(ai); return; }
        try{ ASTATE.endTurn(turn,{status:'error',reply:String((e&&e.message)||'')}); }catch(_){} try{ PROG.done(ai); }catch(_){} ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'AI error')+'</span>'; msgTools(ai,q); try{ const _t=ASTATE.turn(turn); if(inEl&&!String(inEl.value||'').trim()&&!(_t&&_t.operations&&_t.operations.length)){ inEl.value=q; try{ inEl.dispatchEvent(new Event('input',{bubbles:true})); }catch(_){} } }catch(_){}   /* ⚠⚠⚠ (#R775) A TURN THAT DIED WITH NOTHING DONE MUST NOT TAKE THE QUESTION WITH IT. Measured on production 2026-09-17: the Supabase session vanished mid-session (auth-js removes it when a refresh is refused, js/ai-core.js:58 asks for it on every AI call), and the next four questions came back in 253-553 ms as 「Please log in to use AI features.」 The login modal opened; the questions were gone. Nothing in this file records them — `recordTurn` is not reached on this path — so the reader retypes. Restoring the composer costs nothing and claims nothing: it is done ONLY when the turn filed no operation at all (so a partially-completed turn is never re-sent) and ONLY when the composer is empty (so what the reader has already typed is never overwritten). It does not re-send by itself: pressing send stays the reader\'s. */ }
      }finally{ try{ if(gen===_runGen){ _setGoBusy(false); _abortCtl=null; } }catch(_){} }   /* (#R142) only the LATEST turn clears the busy button — a superseding turn keeps its own Stop shown */
    }
    /* (#R44) append a compact, TRUTHFUL record of the exchange to the rolling history (capped). */
    function recordTurn(q, say, acts, fails){ try{ updateWctx(acts,fails); }catch(_){} try{ _parseExclusions(q); }catch(_){}
      try{ const kept=(acts||[]).filter(a=>(fails||[]).indexOf(a)<0); const did=kept.filter(a=>!TCONT.isAsk(a)).map(actLabel).filter(Boolean);   /* ⚠ (#R419) A QUESTION IS THE TURN'S OUTPUT, NOT ONE OF ITS SIDE EFFECTS — it gets its OWN history line below, never a slot in this `did:` list, which is cut at 260 characters (js/atlas-turn-continuity.js) */
      let a='Atlas: '+String(say||'(done)').slice(0,180); if(did.length) a+=' [did: '+did.join('; ').slice(0,260)+']'; if((fails||[]).length) a+=' [failed: '+fails.map(actLabel).join('; ').slice(0,160)+']';
      _hist.push({t:_curTurn,s:'User: '+q.slice(0,4000)}); TCONT.askRecords(kept).forEach(s=>_hist.push({t:_curTurn,s:s})); _hist.push({t:_curTurn,s:a}); if(_hist.length>48) _hist=_hist.slice(-48); }catch(_){} }   /* (#R298) both halves are filed under whichever turn is current. The brief / runDirect entry points bump _runGen but open no turn of their own, so what they record belongs to the last one — which is right: rewinding to before that turn should drop them too */
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
    let _pendingInput=null;   /* ⚠ (#R801) …AND THE ANSWER TO A CONFIRMATION RIDES THE SAME SLOT. js/atlas-executor.js 4b answers `needs_confirm` as a needs_input of kind 'choice'; there is no picker for it, so the reader answers in their next message and Atlas, reading that answer, makes the same call again. `_confirmedBy` is the mechanical half: the call whose identity (`TRES.callKey`, the same identity #R489 uses) matches the question that was asked, in a LATER turn than the one that asked it, inside the resume window, carries `confirmed:true` — which an 'always' row needs and an 'explicit' row does not (a fresh turn with nothing observed yet already runs). It reads no word of the reader's reply; whether they said yes is Atlas's reading, and a call it does not make is not confirmed by anyone. */ function _confirmedBy(id,args){ try{ const p=_pendingInput; if(!p||!p.result||p.result.code!=='needs_confirm'||p.turn===_curTurn||(Date.now()-p.at)>_RESUME_TTL_MS) return false; const ir=p.result.inputRequest; if(!ir||ir.capabilityId!==id||TRES.callKey(id,ir.pendingArgs)!==TRES.callKey(id,args)) return false; _pendingInput=null; return true; }catch(_){ return false; } }
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
      _lastUserMsg=''; const p=ensure();
      const lng=+ll.lng, lat=+ll.lat;
      _herePoint={lng,lat,name:''}; try{ _lastPlace={lng,lat,name:''}; }catch(_){}
      try{ GE().camera.flyTo({center:[lng,lat],zoom:Math.max(GE().camera.getZoom(),5),duration:900}); }catch(_){}
      /* label the pin with the country it falls in (best-effort, non-blocking) so it reads nicely */
      (async()=>{ try{ let nm=''; const cd=(typeof codeAtPoint==='function')?codeAtPoint(lng,lat):null;
          if(cd&&typeof countryStats!=='undefined'&&countryStats[cd]){ const s=countryStats[cd]; nm=(HOST.lang==='jp'?(s.nameJp||s.nameEn):s.nameEn)||''; }
          if(nm&&_herePoint){ _herePoint.name=String(nm).slice(0,80); if(_lastPlace) _lastPlace.name=_herePoint.name; const hd=p.querySelector('.atl-here-hd'); if(hd) hd.textContent='📍 '+String(nm).slice(0,80)+' · '+lat.toFixed(3)+', '+lng.toFixed(3); } }catch(_){} })();
      const coordStr=lat.toFixed(3)+', '+lng.toFixed(3);
      /* ⚠⚠⚠ (#R392) THESE THREE USED TO BE FIXED SENTENCES — Hormuz, Lake Baikal and empty Gobi all opened
         with 「なぜこの辺りはこうなっているの？」, from the most location-specific gesture there is. They come
         from the starter chips' own pools now, measured around THE CLICKED POINT (the flyTo above takes
         900 ms, so the camera still shows the old view); #R309's three are the guaranteed tail in `HERE`. */
      let ex=[]; try{ ex=pointExamples(lng,lat,Math.max(GE().camera.getZoom(),5),3)||[]; }catch(_){}
      READ.arrive('<div class="atl-here-hd" style="font-weight:600;margin-bottom:3px;">📍 '+coordStr+'</div>',
        L('Ask me anything about this spot — I know exactly where it is.','この地点について何でも聞いてください。正確な位置を把握しています。','Fragen Sie mich alles zu diesem Ort — ich kenne die genaue Position.','Спросите что угодно об этом месте — я знаю его точные координаты.','Pregúntame lo que sea sobre este lugar — sé exactamente dónde está.'),
        ex); }
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
        const r=await dispatch(act); if(gen!==_runGen){ _markCancelled(ai); return; }
        ai.innerHTML=(r&&r.html)||''; recordTurn('Research: '+String(name||''),'',[act],(r&&r.ok)?[]:[act]);
      }catch(e){ if(gen===_runGen) ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; else { _markCancelled(ai); return; } }
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
      try{ CAPS.bindRuntime({ dispatch:(a,c)=>dispatch(a,c), docs:_DOCS, schemas:SCHEMAS, effects:{ 'system.control':controlEffect } });   /* (atlas-outward-effects) what the control a call would press declares it does — js/atlas-executor.js 4b reads it BEFORE execution */   /* ⚠⚠⚠ (#R551) FORWARD THE CONTEXT, NOT JUST THE ACTION. This bound a ONE-ARGUMENT wrapper, so the execution context the kernel passes as dispatch's second argument was dropped at the door and every compose in a turn became its own artifact — the whole of #R551 was inert in the browser while every node check stayed green, because the checks bound a two-argument dispatch and the shipping console did not. A wrapper that narrows its callee's signature is a silent lossy adapter. */ }catch(_){}
      /* the state this file OWNS — everything else publishes its own (js/atlas-state.js §8) */
      try{ ASTATE.registerStateProvider('selection', _selectionState);
           ASTATE.registerStateProvider('atlas', _atlasOverlayState);
           ASTATE.registerStateProvider('pinnedPoint', ()=>(_herePoint?{lng:_herePoint.lng,lat:_herePoint.lat,name:_herePoint.name||''}:null));
           ASTATE.registerStateProvider('simulations', _simulationState); }catch(_){}
      /* ══ (atlas-observer-undo) WHAT THIS FILE DRAWS, CLAIMED WITH THE RENDERER, AND HOW IT IS PUT BACK ══
         The four sources below are this file's own drawings. They are CLAIMED here, under the effect keys
         the capability table declares for them, so every verdict asks the renderer about them
         (js/geo-engine.js render.drawn) instead of typing their ids (js/atlas-capabilities.js paintNow).
         The two restorers are this file's half of the ONE undo (js/atlas-state.js undo): the layer
         switches with their opacity, and Atlas's own drawings — put back through the painters that
         drew them, so the state that the next verdict reads and the map agree. */
      try{ const RC=GE().render; RC.claim('nlq-poly-src',['map.highlight','map.polygon'],{clear:clearPolyHl}); RC.claim('nlq-line-src',['map.line','map.highlight'],{clear:clearLineHl}); RC.claim('nlq-poi-src','map.poi',{clear:clearPois}); RC.claim('nlq-era-src','map.highlight'); /* js/atlas-sims.js draws these four; it is claimed here, where its removers are bound, because that module's body is kept byte-identical to the block it was lifted from (tests/atlas-console-kernel-checks.test.mjs (#R199)) */ RC.claim('nlq-fly-src',['map.fly','map.ballistic'],{clear:clearFly}); RC.claim('nlq-blast-src','map.ballistic',{clear:clearBlast}); RC.claim('nlq-elev-src','map.elevation',{clear:clearElev}); RC.claim('nlq-fac-src','map.factions',{clear:clearFac}); }catch(_){}
      try{ ASTATE.registerRestorer('layers',{ covers:['map.layer'],
          capture:()=>{ const o={}; document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach(cb=>{ if(!cb.id) return; const sl=layerOpacityControl(cb); o[cb.id]={on:!!cb.checked,op:sl?String(sl.value):null}; }); return o; },
          restore:(want,now)=>{ Object.keys(want||{}).forEach(id=>{ const w=want[id], n=now&&now[id], cb=document.getElementById(id); if(!cb||!n) return;
            if(w.on!==n.on){ cb.checked=w.on; cb.dispatchEvent(new Event('change',{bubbles:true})); }
            if(w.op!=null&&w.op!==n.op){ const sl=layerOpacityControl(cb); if(sl){ sl.value=w.op; sl.dispatchEvent(new Event('input',{bubbles:true})); sl.dispatchEvent(new Event('change',{bubbles:true})); } } }); } });
        const sameList=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]), sameMap=(a,b)=>{ const ka=Object.keys(a).sort(), kb=Object.keys(b).sort(); return sameList(ka,kb)&&ka.every(k=>a[k]===b[k]); };
        ASTATE.registerRestorer('atlas',{ covers:['map.highlight','map.choropleth','map.polygon','map.line','map.poi'],
          capture:()=>({ hl:Array.from(_hl).map(String).sort(), polys:_hlPolys.slice(), lines:_hlLines.slice(), choro:Object.assign({},_choroState), metric:_choroMetric, ramp:_choroRamp.slice(), custom:_customScoreName, pois:_pois.slice(), poiColor:_poiColor, name:_wctx.highlight||null }),
          /* identity, not JSON: a drawing put back IS the object that was drawn, and polygons are too large to stringify on every turn */
          same:(a,b)=>!!(a&&b)&&sameList(a.hl,b.hl)&&sameList(a.polys,b.polys)&&sameList(a.lines,b.lines)&&sameList(a.pois,b.pois)&&sameMap(a.choro,b.choro)&&a.metric===b.metric&&a.custom===b.custom,
          restore:(w)=>{ clearHl(); if(w.hl.length) highlight(w.hl);
            _hlPolys=w.polys.slice(); paintPolys(); _hlLines=w.lines.slice(); paintLines();
            clearChoro(); const ks=Object.keys(w.choro); if(ks.length&&ensureChoroLayer()){ _choroRamp=w.ramp.slice(); try{ GE().layers.setPaint('nlq-choro','fill-color',_choroFillExpr(_choroRamp)); }catch(_){} ks.forEach(c=>{ try{ GE().layers.setFeatureState({source:'nlq-src',id:c},{choroV:w.choro[c]}); }catch(_){} }); _choroState=Object.assign({},w.choro); }
            _choroMetric=w.metric; _customScoreName=w.custom; _pois=w.pois.slice(); _poiColor=w.poiColor; paintPois();
            try{ _wctx.highlight=w.name; }catch(_){} } }); }catch(_){}
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
      const ai=_pend(bubble('a',stageDots('think')),'think');
      const gen=++_runGen;
      try{ const fails=await runActions(ai,'',acts,gen); if(gen===_runGen) recordTurn(String(label||''),'',acts,fails); }catch(e){ try{ ai.innerHTML='<span style="color:#ff453a;">'+esc((e&&e.message)||'error')+'</span>'; }catch(_){} }
      try{ PROG.done(ai); }catch(_){} try{ msgTools(ai,String(label||'')); }catch(_){} }
    return { open, toggle, close:_atlClose, mountTab, run, runDirect, brief:briefEntry, askHere, askReading:()=>READ.askReading(), dispatch:a=>dispatch(a), wctx:()=>{ try{ return JSON.parse(JSON.stringify(_wctx)); }catch(_){ return null; } }, state:()=>{ try{ return stateContext(); }catch(_){ return ''; } } };
  })();
};

