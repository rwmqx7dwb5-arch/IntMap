/* ============================================================================
 *  IntMap · ATLAS — the PLAN: its schema, its validation, its goal, its execution  (#R318)
 * ----------------------------------------------------------------------------
 *  Two things live here, and they were two halves of one subject all along.
 *
 *  ① THE #R135 TIME-AXIS BLOCK, MOVED WHOLE. The request profile, the action-capability registry,
 *     the semantic retry key, the world-expansion guard, the pre-execution plan validation, the
 *     repair instruction and the post-execution goal validation came out of js/atlas-console.js
 *     verbatim. Nothing in them changed except `ATLAS_ACTION_CAPABILITIES`, which had FOUR entries
 *     for a dispatch of a hundred and fifteen and is now GENERATED from the Capability Registry —
 *     the four tuned rows keep their exact values, and every other capability gets a permissive
 *     descriptor, so `_validatePlan` decides exactly what it decided before while the registry is
 *     finally complete. tests/r318-checks.test.mjs re-derives that byte-identity from both files.
 *
 *  ② THE PLAN AS A STRUCTURE. `atlas_plan` came back as "JSON-shaped text": an `actions` array of
 *     free objects, run strictly in order, with no way to say that step 2 needs step 1's answer and
 *     no way for the client to reject a step naming an action that does not exist. #R278's
 *     「その機能は実行できません」 and #R291's geocode-the-same-place-four-times are both that gap.
 *     So: a declared schema, deterministic client-side validation against the registry, `$ref`
 *     between steps, a dependency graph instead of a queue, and a GoalSpec that decides whether the
 *     turn is over.
 *
 *  ⚠ `actions` IS NOT DEPRECATED AND IS NOT GOING AWAY THIS ROUND. Every model reply still parses,
 *  because `normalize()` accepts the old array, the new `steps`, a bare array, or a single action
 *  object — the four shapes js/atlas-console.js already tolerated plus one. A round that replaced
 *  the plan format outright would have broken every request while the model learned the new one.
 *
 *  ⚠ THE GOAL IS A GATE, NOT A NOTE. #R135 computed `_goalValidation` and filed it in the debug
 *  record; nothing read it. Here `evaluateGoal()` decides whether the turn may end, what the repair
 *  pass is aimed AT (the unmet goal, not the failed call), and what the user is told when it cannot
 *  be met. 「map要求は実際のmap出力なしに完了しない。」
 * ==========================================================================*/
export function makeAtlasPlanner(HOST, CTX) {
  return (function () {
    var WORLD_RE = CTX.WORLD_RE;
    var Caps = CTX.capabilities, Results = CTX.results, Exec = CTX.executor, State = CTX.state;
    var personaPrompt = CTX.personaPrompt;

    var _wctx = CTX.wctx;   /* the live conversation context object, by reference — `_requestProfile`
                               reads `_wctx.year` and js/atlas-console.js keeps mutating that field */

    /* ---- temporal / evidence markers (5 languages) ---- */
    const _RP_PAST_DEIXIS=/当時|その(?:頃|ころ)|この(?:時代|頃|ころ)|あの(?:頃|ころ|時代)|往時|昔|かつて|当[時代]|back then|at (?:that|the) time|in those days|of the (?:day|time|era|period)|damals|seinerzeit|тогда|в то время|в ту эпоху|entonces|en (?:aquella|esa) época|de la época/i;
    const _RP_ERA_WORD=/戦間期|中世|近世|古代|近代|冷戦(?:期|時代)?|大戦(?:期|中|前|後)?|江戸(?:時代)?|明治|大正|昭和初期|帝政|王政|植民地(?:時代)?|middle ages|medi(?:a|e)eval|antiquity|\bancient\b|colonial(?: era| period| times)?|interwar|cold[- ]war|imperial era|victorian|belle époque|mittelalter|antike|kolonialzeit|zwischenkriegszeit|средневеков|античн|колониальн|межвоенн|edad media|época colonial|guerra fría/i;
    const _RP_NOW=/今の|今は|今どう|今なに|今何|今起き|いまの|現在|現時点|最新|直近|足元|きょう|今日|nowadays|\btoday\b|tonight|\bnow\b|\bcurrent(?:ly)?\b|\blatest\b|right now|present[- ]day|как сейчас|\bсейчас\b|\bсегодня\b|актуальн|\bheute\b|\baktuell\b|\bderzeit\b|\bhoy\b|\bahora\b|actualmente|\bactual\b/i;
    const _RP_CMP=/比較|くらべ|比べ|対比|\bversus\b|\bvs\.?\b|\bcompare\b|compared|contrast|gegenüber|\bvergleich|сравн|\bcompar(?:a|e)|frente a/i;
    const _RP_WATER=/(?:^|[ 　])?[^ 　、。]*?(?:海(?![外軍運])|湾|海峡|灘|水道)(?:[はがのをへとにで、。\s]|$)|\b(?:sea|gulf|bay|strait|ocean|channel|sound)\b|мор[ея]\b|\bзалив|\bпролив|\bgolfo\b|\bestrecho\b|\bbahía\b/i;
    /* Extract the last plausible PAST year mentioned (1000..currentYear-1). */
    function _rpExtractYear(q){ q=String(q||''); let best=null; const yNow=(new Date()).getFullYear();
      const re=/(?:^|[^0-9.,])((?:1[0-9]|20)[0-9]{2})\s*(?:年|CE|AD|BCE?)?/g; let m;
      while((m=re.exec(q))){ const y=+m[1]; if(y>=1000&&y<=yNow) best=y; } return best; }
    /* Coarse geographic-KIND hint from the raw text (the planner still resolves the exact place). */
    function _rpGeoKind(q){ q=String(q||'');
      if(_RP_WATER.test(q)) return 'water';
      if(/山脈|高原|平野|盆地|砂漠|半島|地方|地域|平原|草原|流域|交易圏|文化圏|\bplateau\b|\bbasin\b|\bvalley\b|\bplain\b|\bdesert\b|peninsula|\bcoast\b|\bregion\b|\bsteppe\b|\bdelta\b/i.test(q)) return 'region';
      if(/帝国|王国|公国|共和国|ソ連|王朝|汗国|\bempire\b|\bkingdom\b|khanate|caliphate|\brepublic of\b|dynasty|\breich\b|царство|ханство/i.test(q)) return 'historical-entity';
      if(/\bcity\b|\btown\b|市$|区$|町$/i.test(q)) return 'city';
      return 'unknown'; }
    /* (#R135 §3) Build the lightweight REQUEST PROFILE. opts lets the regression harness pin the clock/travel state. */
    function _requestProfile(q, opts){ opts=opts||{}; q=String(q||'');
      const yNow=(typeof opts.nowYear==='number')?opts.nowYear:(new Date()).getFullYear();
      let live=true, dispYear=null;
      try{ if('live' in opts) live=!!opts.live; else if(window.IntMapTime) live=window.IntMapTime.isLive(); }catch(_){}
      try{ dispYear=('dispYear' in opts)?opts.dispYear:((window.IntMapTime&&!live)?window.IntMapTime.year():null); }catch(_){}
      const convYear=('convYear' in opts)?opts.convYear:(function(){ try{ const y=+String((_wctx&&_wctx.year!=null)?_wctx.year:'').replace(/[^0-9]/g,''); return (y>=1000&&y<yNow)?y:null; }catch(_){ return null; } })();
      const explicitYear=_rpExtractYear(q);
      const deixisPast=_RP_PAST_DEIXIS.test(q)||_RP_ERA_WORD.test(q);
      const nowMk=_RP_NOW.test(q), cmpMk=_RP_CMP.test(q);
      const nowRef=nowMk||/現在|現代|今日|nowadays|present|\btoday\b/i.test(q);
      /* target year + source: explicit(1) → deixis+travelling map-state → conversation(2) → travelling map-state(3) → none */
      let targetYear=null, tSource='none';
      if(explicitYear!=null&&explicitYear<yNow){ targetYear=explicitYear; tSource='explicit'; }
      else if(deixisPast&&!live&&dispYear!=null){ targetYear=dispYear; tSource='map-state'; }
      else if(convYear!=null){ targetYear=convYear; tSource='conversation'; }
      else if(!live&&dispYear!=null){ targetYear=dispYear; tSource='map-state'; }
      /* temporal mode */
      const histSignal=(explicitYear!=null&&explicitYear<yNow)||deixisPast||(!live&&dispYear!=null&&!nowMk);
      let temporalMode='unspecified';
      if(cmpMk&&(histSignal||targetYear!=null)&&nowRef) temporalMode='mixed';
      else if(nowMk&&!deixisPast&&!(explicitYear!=null&&explicitYear<yNow)) temporalMode='current';
      else if(histSignal) temporalMode='historical';
      else if(nowMk) temporalMode='current';
      if(temporalMode==='current'){ targetYear=null; tSource='none'; }
      const evidenceMode=temporalMode==='historical'?'historical':temporalMode==='mixed'?'mixed':temporalMode==='current'?'live':'none';
      const geoKind=_rpGeoKind(q);
      const wantMap=/地図|マップ|マッピング|地図上|地図に|地図で|on the map|\bmap\b|見せて|表示して|plot|\bpin\b|karte|карт|mapa/i.test(q);
      /* (#R347) 「中国へ移動して」 asks for the MAP without containing the word 地図 — and `wantMap`
         above, written for 「地図上で教えて」, does not see it. goalImpact() needs the difference
         between a map move the user ASKED FOR and one Atlas added itself, so the navigation verbs
         get their own signal rather than being folded into wantMap (which the planner prompt reads,
         and which must keep meaning 「the answer must appear on the map」). */
      const wantNav=/移動して|移動する|飛んで|飛ぶ|行って|向かって|ズーム|拡大して|寄って|中心に|中央に|映して|go to|goto|fly to|navigate|zoom|centre? on|move to|take me to|jump to|перейти|перелет|центрир|zeig mir|springe|ir a|centra en|vete a|이동|가줘/i.test(q);
      const wantCmp=cmpMk;
      const wantExpl=(/[?？]|どう|どんな|なに|何|なぜ|どうして|状況|情勢|様子|教えて|説明|について|解説|どうなって|\bwhat\b|\bwhy\b|\bhow\b|which|situation|status|tell me|explain|describe|about\b|\bwas\b|\bwer\b|\bqué\b|\bкак\b/i.test(q))||temporalMode!=='unspecified';
      return { temporalMode, targetYear, temporalSource:tSource, geoQuery:'', geoKind, evidenceMode, outputs:{ explanation:!!wantExpl, map:!!wantMap, comparison:!!wantCmp, navigation:!!wantNav } }; }
    /* (#R135 §3) The [REQUEST PROFILE] block the planner reads (machine-parsed hints; the rules are then ENFORCED). */
    function _profileBlock(p){ if(!p) return ''; const outs=[]; if(p.outputs.explanation) outs.push('explanation'); if(p.outputs.map) outs.push('map'); if(p.outputs.comparison) outs.push('comparison');
      const yStr=(p.targetYear!=null)?p.targetYear:'null';
      return '[REQUEST PROFILE] (machine-derived hints; the capability rules below are ENFORCED after you plan — respect them)\n'
        +'Temporal mode: '+p.temporalMode+'\nTarget year: '+(p.targetYear!=null?p.targetYear:'(none / present)')+'\nTemporal source: '+p.temporalSource+'\nGeographic kind (hint): '+p.geoKind+'\nRequested outputs: '+(outs.join(' + ')||'(unspecified)')+'\nRequired evidence mode: '+p.evidenceMode+'\n'
        +'ACTION-CHOICE RULES (enforced): mapReport maps ONLY current/recent LIVE-NEWS incidents — NEVER use it for a historical or map-state question, a past-era general situation, historical background / powers / trade / strategic importance, or stable knowledge. For "what was the situation at PLACE in YEAR" or "at that time / この時代 / 当時", and for a place or topic\'s present-day situation that is not a specific live-incident hunt, use {"type":"researchMap","topic":...,"place":...,"temporalMode":"'+p.temporalMode+'","year":'+yStr+',"evidenceMode":"'+p.evidenceMode+'"}. historicalMap is ONLY for an era\'s ALLIANCE / faction / power map — never for a single sea, region or city. Keep the target year above. When an explanation is requested, the plan MUST include an action that produces one (researchMap / analyze / answer) — never only navigation. For a MIXED request cover BOTH the historical and the present side and keep them clearly separate.\n';
    }
    /* Family of an action (groups translations/synonyms so a semantic retry can dedupe them). */
    function _actionFamily(a){ const t=(a&&a.type)||'';
      if(t==='mapReport'||t==='newsMap'||t==='reportMap') return 'live-research-map';
      if(t==='researchMap'||t==='research_map'||t==='situationMap') return 'research-map';
      if(t==='historicalMap'||t==='historical'||t==='powerMap'||t==='allianceMap') return 'historical-map';
      if(t==='analyze'||t==='research'||t==='synthesize') return 'analysis';
      if(t==='brief') return 'brief';
      if(t==='flyTo'||t==='fly'||t==='zoom'||t==='pan'||t==='bearing'||t==='pitch'||t==='projection'||t==='base'||t==='terrain3d'||t==='resetNorth'||t==='locate'||t==='search') return 'navigate';
      return t||'other'; }
    /* Retry KEY for the research-prone families: family + temporal mode (target-INDEPENDENT), so
       mapReport("オホーツク海") / mapReport("Sea of Okhotsk") / mapReport("Okhotsk Sea") all collapse to ONE key. */
    function _researchFamKey(a){ const f=_actionFamily(a);
      if(f==='live-research-map'||f==='research-map'||f==='historical-map'||f==='analysis'){ const m=String((a&&a.temporalMode)||'')||(f==='live-research-map'?'live':''); return f+'|'+m; }
      return ''; }
    /* Full semantic descriptor (§10) — kept for the debug record. */
    function _semanticRetryKey(a, profile){ return { actionFamily:_actionFamily(a), temporalMode:String((a&&a.temporalMode)||(profile&&profile.temporalMode)||''), userGoal:(profile&&profile.temporalMode==='historical')?'historical-situation':((profile&&profile.outputs&&profile.outputs.comparison)?'comparison':'research'), key:_researchFamKey(a) }; }
    /* Would this action blow the scope up to the whole world when the user asked about a SPECIFIC feature? (§10) */
    function _isWorldExpansion(a, profile){ try{ const pl=String((a&&(a.place||a.era||a.topic))||'');
      const world=WORLD_RE.test(pl)||((a&&(a.type==='historicalMap'||a.type==='allianceMap'||a.type==='powerMap'))&&!pl);
      if(!world) return false; const gk=(profile&&profile.geoKind)||''; return gk!==''&&gk!=='unknown'; }catch(_){ return false; } }
    /* (#R135 §7) PRE-EXECUTION plan validation: fix incompatible actions BEFORE running them (not repair AFTER). */
    function _validatePlan(acts, profile, q){ const rejected=[]; if(!Array.isArray(acts)) return {plan:acts,rejected};
      const mode=(profile&&profile.temporalMode)||'unspecified';
      const year=(profile&&profile.targetYear!=null)?profile.targetYear:null;
      const gk=(profile&&profile.geoKind)||'unknown';
      const wantExpl=!!(profile&&profile.outputs&&profile.outputs.explanation);
      const _alliance=a=>/alliance|faction|\bpower\b|\bbloc\b|\baxis\b|同盟|陣営|勢力|連合|枢軸|大戦|冷戦|世界大戦|world war|\bww ?(?:1|2|i|ii)\b|cold[- ]war|\bwar\b/i.test(String((a&&(a.era||a.topic||a.question||a.place||a.title))||''));
      const out=[];
      for(const a of acts){ if(!a||!a.type){ out.push(a); continue; } const t=a.type;
        if((t==='mapReport'||t==='newsMap'||t==='reportMap')&&mode==='historical'){
          const na={type:'researchMap',topic:String(a.topic||a.question||a.query||'').trim(),place:String(a.place||'').trim(),temporalMode:'historical',evidenceMode:'historical'}; if(year!=null) na.year=year; if(a.count!=null) na.count=a.count;
          rejected.push({from:t,to:'researchMap',reason:'historical_question_routed_to_live_mapReport'}); out.push(na); continue; }
        if((t==='mapReport'||t==='newsMap'||t==='reportMap')&&mode==='mixed'){
          const na={type:'researchMap',topic:String(a.topic||'').trim(),place:String(a.place||'').trim(),temporalMode:'mixed',evidenceMode:'mixed'}; if(year!=null) na.year=year;
          rejected.push({from:t,to:'researchMap',reason:'mixed_request_needs_both_sides'}); out.push(na); continue; }
        if((t==='historicalMap'||t==='historical'||t==='powerMap'||t==='allianceMap')&&!_alliance(a)&&(gk==='water'||gk==='region'||gk==='point'||gk==='city'||gk==='historical-entity')){
          const na={type:'researchMap',topic:String(a.topic||a.question||'').trim(),place:String(a.place||a.era||'').trim(),temporalMode:'historical',evidenceMode:'historical'}; if(year!=null) na.year=year;
          rejected.push({from:t,to:'researchMap',reason:'local_feature_is_not_an_alliance_map'}); out.push(na); continue; }
        out.push(a); }
      /* R3: explanation wanted for a historical/mixed question but the plan produces none → add a researchMap */
      if(wantExpl&&(mode==='historical'||mode==='mixed')&&out.length){
        const hasProducer=out.some(a=>{ const f=_actionFamily(a); return f==='research-map'||f==='live-research-map'||f==='analysis'||f==='brief'; });
        const navOnly=out.every(a=>_actionFamily(a)==='navigate');
        const answerOnly=out.every(a=>a&&a.type==='answer');
        if(!hasProducer&&(navOnly||((answerOnly||out.every(a=>_actionFamily(a)==='navigate'||a.type==='answer'||a.type==='outline'||a.type==='highlight'||a.type==='layer'))&&profile.outputs.map))){
          const keep=out.filter(a=>a&&a.type!=='answer'); const nav=keep.find(a=>a&&a.place);
          const na={type:'researchMap',topic:(answerOnly&&out[0]&&out[0].text)?String(out[0].text).slice(0,120):String(q||'').slice(0,140),place:nav?String(nav.place).trim():'',temporalMode:mode,evidenceMode:(profile.evidenceMode||'historical')}; if(year!=null) na.year=year;
          rejected.push({from:(navOnly?'(nav-only)':'(answer-only)'),to:'researchMap',reason:'explanation_and_map_need_a_research_producer'});
          return {plan:keep.concat([na]),rejected}; } }
      return {plan:out, rejected}; }
    /* Repair instruction (§10) — the loose "nearby well-known place / coarser target" advice is REMOVED. */
    function _repairGuidance(){ return 'Do NOT give up, but stay faithful to the request. Propose a GENUINELY different, documented action for the UNMET part only. HARD limits: never re-issue the same call with only a renamed / re-spelt / translated target; never switch a historical question to live news (mapReport) or vice-versa; never change the required evidence mode; never replace a specific place with a whole-world or continental thematic map. If you must widen the target, widen it by ONE step to its immediate surrounding region only (e.g. a sea → its coastline / bordering lands), keeping the original subject. A failure to DRAW on the map is NOT a failure to ANSWER: if the explanation is already given, do not retry the map. Only if it is genuinely impossible with the documented actions, reply with a single "answer" explaining specifically what is impossible. '
      + 'When an [EXECUTION RESULT] block is present it is IntMap\'s honest, mechanical observation — IntMap did NOT correct, substitute, drop or reinterpret any identifier; that decision is YOURS. Read "unresolved" and each item\'s "availableIdentifiers": if a candidate is correct, re-issue the SAME action type with the corrected identifier(s) — that is an intended fix, NOT a forbidden rename retry. If no candidate is right, re-search, ask the user a specific question, or explicitly accept the partial result. Never report a target as done unless it appears in "resolved" and the render was verified.'; }
    /* (#R135 §12) Post-execution goal validation — "tool succeeded" is separated from "user goal satisfied". */
    function _goalValidation(profile, outcomes){ outcomes=outcomes||[];
      const okOut=outcomes.filter(o=>o&&o.ok);
      const actionSucceeded=okOut.length>0;
      const producedAll=[].concat.apply([], outcomes.map(o=>(o&&o.produced)||[]));
      const explanationProduced=producedAll.indexOf('explanation')>=0||okOut.some(o=>['answer','analyze','research','synthesize','brief'].indexOf(o.type)>=0);
      const mapRendered=producedAll.indexOf('map')>=0||okOut.some(o=>['flyTo','fly','outline','highlight','poi','mapReport','researchMap','mapMetric','historicalMap','radius','pin'].indexOf(o.type)>=0);
      const modeOut=outcomes.filter(o=>o&&o.temporalMode);
      const temporalMatch=!profile||!profile.temporalMode||profile.temporalMode==='unspecified'||modeOut.length===0||modeOut.some(o=>o.temporalMode===profile.temporalMode||profile.temporalMode==='mixed');
      const geographicRelevance=okOut.some(o=>o&&o.semanticTarget)?1:(mapRendered?0.6:0.3);
      const wantExpl=!!(profile&&profile.outputs&&profile.outputs.explanation);
      const userGoalSatisfied=actionSucceeded&&(!wantExpl||explanationProduced)&&temporalMatch;
      return { actionSucceeded, mapRendered, explanationProduced, geographicRelevance, temporalMatch, userGoalSatisfied }; }

    /* ══ ① continued — the registry-generated capability table ═════════════════════════════════
       The four rows below are #R135's, character for character. Everything else is derived: a
       capability that has never been given temporal semantics accepts every temporal mode, which is
       precisely how `_validatePlan` treated it when it was absent from the table. The difference is
       that it is now PRESENT — so the audit can see it, and a future round can tighten one row
       without having to invent the other hundred and eleven. */
    function _buildActionCapabilities() {
      var out = {
        mapReport:   { temporalModes:['current','mixed','unspecified'], evidenceModes:['live'], outputs:['explanation','map'], geoKinds:['point','city','country','region','water'] },
        researchMap: { temporalModes:['historical','current','mixed','unspecified'], evidenceModes:['historical','live','mixed'], outputs:['explanation','map'], geoKinds:['point','city','country','region','water','historical-entity','unknown'] },
        historicalMap:{ temporalModes:['historical'], evidenceModes:['historical'], outputs:['thematic-map'], topics:['alliance','faction','war','political-bloc'] },
        analyze:     { temporalModes:['current','mixed','unspecified'], evidenceModes:['live','mixed'], outputs:['explanation'] }
      };
      var ALL_T = ['historical', 'current', 'mixed', 'unspecified'];
      var ALL_E = ['historical', 'live', 'mixed', 'none'];
      try {
        Caps.all().forEach(function (c) {
          c.aliases.forEach(function (a) {
            if (out[a]) return;
            out[a] = { temporalModes: ALL_T.slice(), evidenceModes: ALL_E.slice(),
              outputs: c.produces.slice(), capabilityId: c.id, derived: true };
          });
        });
      } catch (_) { }
      return out;
    }

    /* ══ ② THE PLAN SCHEMA ═══════════════════════════════════════════════════════════════════════
       The dialect is the one the other structured tasks in this app already use (RESEARCH_MAP_SCHEMA
       in js/atlas-console.js, MAP_REPORT_SCHEMA in the proxy): upper-case type names, `properties`,
       `required`. `args` is deliberately untyped — every capability has its own argument shape and
       a union of a hundred and fifteen of them is not a schema, it is a wall. The ARGUMENTS are
       checked instead by validate(), against the capability the step actually names. */
    var PLAN_SCHEMA = { type: 'OBJECT', properties: {
      say: { type: 'STRING' },
      replyMode: { type: 'STRING' },
      goal: { type: 'OBJECT', properties: {
        intent: { type: 'STRING' },
        requiredOutputs: { type: 'ARRAY', items: { type: 'STRING' } },
        temporalMode: { type: 'STRING' },
        evidenceMode: { type: 'STRING' },
        constraints: { type: 'ARRAY', items: { type: 'STRING' } }
      } },
      actions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { type: { type: 'STRING' } }, required: ['type'] } },
      steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        id: { type: 'STRING' },
        capabilityId: { type: 'STRING' },
        dependsOn: { type: 'ARRAY', items: { type: 'STRING' } },
        expectedOutputs: { type: 'ARRAY', items: { type: 'STRING' } },
        onFailure: { type: 'STRING' }
      }, required: ['id', 'capabilityId'] } }
    }, required: ['actions'] };

    /* ══ GOALSPEC ═══════════════════════════════════════════════════════════════════════════════
       Derived from the request profile #R135 already computes plus the plan's own declaration, so
       a model that states its goal is believed about its INTENT and never about its ACHIEVEMENT. */
    function goalSpec(profile, plan, q) {
      var outs = (profile && profile.outputs) || {};
      var req = [];
      if (outs.explanation) req.push('explanation');
      if (outs.map) req.push('map');
      if (outs.comparison) req.push('comparison');
      var declared = (plan && plan.goal && Array.isArray(plan.goal.requiredOutputs)) ? plan.goal.requiredOutputs : [];
      declared.forEach(function (o) { if (req.indexOf(o) < 0 && ['explanation', 'map', 'panel', 'route', 'object', 'camera', 'file', 'setting'].indexOf(o) >= 0) req.push(o); });
      var rules = req.map(function (o) { return { kind: o === 'map' ? 'map-visible' : o === 'explanation' ? 'explanation-produced' : 'output-produced', output: o }; });
      /* An operation was asked for when the plan contains anything that writes. That is what makes
         「操作要求に文章だけを返さない」 checkable rather than a matter of tone. */
      var actionAsked = false;
      try {
        actionAsked = (plan && Array.isArray(plan.actions) ? plan.actions : []).some(function (a) {
          var c = a && a.type && Caps.resolve(a.type);
          return !!(c && c.effects.writes.length);
        });
      } catch (_) { }
      if (actionAsked) rules.push({ kind: 'action-performed' });
      return {
        requestedOutputs: req, targets: [],
        temporalMode: (profile && profile.temporalMode) || 'unspecified',
        evidenceMode: (profile && profile.evidenceMode) || 'none',
        constraints: (plan && plan.goal && plan.goal.constraints) || [],
        intent: (plan && plan.goal && plan.goal.intent) || String(q || '').slice(0, 160),
        completionRules: rules
      };
    }

    /* ══ (#R347) GOAL IMPACT — 「補助的に実行した地図移動の失敗」と「頼まれた地図が出ない」は別の事故 ══
       Reported: an informational question was answered correctly in prose, and the reply opened with
       「⚠ 実行できなかった操作が 1 件あります」 because a flyTo Atlas had ADDED ITSELF did not land. The
       turn summary counted failed actions; nothing asked whose goal each action served.

       ⚠ IT IS DERIVED FROM THE REQUEST, NOT FROM THE ACTION TYPE. The same `flyTo` is `primary` when
       the user said 「中国へ移動して」 and `secondary` when they asked what supports the Chinese economy
       and Atlas decided a map move would be a nice touch. That is why the profile — not a list of
       important capabilities — is the input.

         primary   — this action is (part of) an output the user asked for. Its failure downgrades
                     the turn to `partial`, or to `failed` when nothing primary succeeded.
         secondary — a courtesy Atlas added. Its failure is reported as a quiet note AFTER the
                     answer and never changes the turn's status.
         none      — nothing the reader is owed. */
    function goalImpact(profile, act) {
      if (!act || !act.type) return 'none';
      if (act.__goalImpact) return String(act.__goalImpact);
      var outs = (profile && profile.outputs) || {};
      var c = null; try { c = Caps.resolve(act.type); } catch (_) { c = null; }
      var produces = (c && Array.isArray(c.produces)) ? c.produces : [];
      var writes = !!(c && c.effects && c.effects.writes && c.effects.writes.length);
      var isMap = produces.indexOf('map') >= 0 || produces.indexOf('camera') >= 0;
      var isExpl = produces.indexOf('explanation') >= 0;
      /* An explanation is never decoration: if it fails, the reader has no answer. */
      if (isExpl) return 'primary';
      if (produces.indexOf('comparison') >= 0 && outs.comparison) return 'primary';
      if (isMap) return (outs.map || outs.navigation) ? 'primary' : 'secondary';
      /* A setting, a panel or a control is in the plan only because the request named it. */
      if (writes || produces.length) return 'primary';
      return 'none';
    }

    /* evaluateGoal(goal, results) — what is still owed, computed from OBSERVED results only.
       ⚠ It never reads the planner's `say`. That sentence is the model's claim; these are the
       app's observations, and the whole file exists because those two used to be the same field. */
    function evaluateGoal(goal, results) {
      results = (results || []).filter(Boolean);
      var produced = Object.create(null);
      var anyOpen = false, anyWrite = false, anyCompleted = false;
      results.forEach(function (r) {
        if (r.status === 'running' || r.status === 'needs_input') anyOpen = true;
        if (r.status === 'completed' || r.status === 'partial') {
          (r.produced || []).forEach(function (p) { produced[p] = 1; });
          if (r.status === 'completed') anyCompleted = true;
        }
        try {
          var c = Caps.resolve(r.capabilityId);
          if (c && c.effects.writes.length && r.status === 'completed') anyWrite = true;
        } catch (_) { }
      });
      var unmet = [];
      (goal.completionRules || []).forEach(function (rule) {
        if (rule.kind === 'map-visible' && !produced.map) unmet.push({ kind: 'map-visible', messageKey: 'atlas.goal.map_missing' });
        else if (rule.kind === 'explanation-produced' && !produced.explanation) unmet.push({ kind: 'explanation-produced', messageKey: 'atlas.goal.explanation_missing' });
        else if (rule.kind === 'output-produced' && !produced[rule.output]) unmet.push({ kind: 'output-produced', output: rule.output, messageKey: 'atlas.goal.map_missing' });
        else if (rule.kind === 'action-performed' && !anyWrite) unmet.push({ kind: 'action-performed', messageKey: 'atlas.goal.action_missing' });
      });
      var partial = results.filter(function (r) { return r.status === 'partial'; });
      return {
        satisfied: !unmet.length && !anyOpen && (anyCompleted || !results.length),
        open: anyOpen, unmet: unmet, produced: Object.keys(produced).sort(),
        partial: partial.map(function (r) { return { capabilityId: r.capabilityId, code: r.code, unresolved: r.unresolved }; }),
        /* what a repair pass must aim at: the UNMET GOAL, never "the call that failed" */
        repairTargets: unmet.map(function (u) { return u.kind; })
      };
    }

    /* ══ VALIDATION ═════════════════════════════════════════════════════════════════════════════
       「未知のCapability、未知の引数、型違いを黙って捨てない。」 A rejected step is REPORTED with a
       reason so the repair pass can be told what was wrong, and so the audit corpus can count it. */
    var REF_RE = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_]+)$/;
    function validate(plan, opts) {
      opts = opts || {};
      var rejected = [], steps = [];
      var seen = Object.create(null);
      (plan.steps || []).forEach(function (s, i) {
        if (!s || typeof s !== 'object') { rejected.push({ index: i, reason: 'not_an_object' }); return; }
        var id = String(s.id || ('step-' + (i + 1)));
        if (seen[id]) { rejected.push({ index: i, id: id, reason: 'duplicate_step_id' }); return; }
        var cap = Caps.resolve(s.capabilityId || s.type);
        if (!cap) { rejected.push({ index: i, id: id, capabilityId: s.capabilityId || s.type || '', reason: 'unknown_capability' }); return; }
        if (cap.withdrawn) { rejected.push({ index: i, id: id, capabilityId: cap.id, reason: 'withdrawn_capability' }); return; }
        var deps = (Array.isArray(s.dependsOn) ? s.dependsOn : []).map(String);
        var bad = deps.filter(function (d) { return !seen[d]; });
        if (bad.length) { rejected.push({ index: i, id: id, reason: 'unknown_dependency', detail: bad.join(',') }); return; }
        /* $ref resolution is checked HERE, not at run time: a reference to a step that does not
           exist, or to an output that step does not declare, is a plan defect, not a runtime one. */
        var refBad = null;
        (function walk(v) {
          if (!v || typeof v !== 'object' || refBad) return;
          if (typeof v.$ref === 'string') {
            var m = REF_RE.exec(v.$ref);
            if (!m) { refBad = v.$ref; return; }
            if (!seen[m[1]]) { refBad = v.$ref; return; }
            if (seen[m[1]].expectedOutputs.length && seen[m[1]].expectedOutputs.indexOf(m[2]) < 0) { refBad = v.$ref; return; }
            return;
          }
          Object.keys(v).forEach(function (k) { walk(v[k]); });
        })(s.args || {});
        if (refBad) { rejected.push({ index: i, id: id, reason: 'unresolvable_ref', detail: refBad }); return; }
        var v2 = Exec ? Exec.validateArgs(cap.inputSchema, s.args || {}) : { ok: true, errors: [] };
        if (!v2.ok) { rejected.push({ index: i, id: id, capabilityId: cap.id, reason: 'bad_args', detail: JSON.stringify(v2.errors).slice(0, 200) }); return; }
        var st = { id: id, capabilityId: cap.id, args: s.args || {}, dependsOn: deps,
          expectedOutputs: (Array.isArray(s.expectedOutputs) ? s.expectedOutputs : cap.produces).slice(),
          onFailure: ['repair', 'stop_dependents', 'continue', 'stop_all'].indexOf(s.onFailure) >= 0 ? s.onFailure : 'stop_dependents' };
        seen[id] = st; steps.push(st);
      });
      return { steps: steps, rejected: rejected };
    }

    /* normalize(plan) — the four legacy shapes plus the new one, into ONE. `actions` becomes steps
       with no dependencies, which is exactly what running them in order has always meant. */
    function normalize(plan) {
      if (Array.isArray(plan)) plan = { actions: plan };
      else if (plan && plan.type && !plan.actions && !plan.steps) plan = { actions: [plan], say: plan.say };
      plan = plan || {};
      var acts = Array.isArray(plan.actions) ? plan.actions : [];
      var steps = Array.isArray(plan.steps) ? plan.steps : [];
      if (!steps.length && acts.length) {
        steps = acts.map(function (a, i) {
          var cap = a && a.type ? Caps.resolve(a.type) : null;
          var args = {}; Object.keys(a || {}).forEach(function (k) { if (k !== 'type') args[k] = a[k]; });
          return { id: 'step-' + (i + 1), capabilityId: cap ? cap.id : String((a && a.type) || ''), args: args,
            dependsOn: [], expectedOutputs: cap ? cap.produces.slice() : [], onFailure: 'continue' };
        });
      }
      return { say: plan.say || '', replyMode: plan.replyMode || 'results-plus-explanation',
        goal: plan.goal || null, actions: acts, steps: steps };
    }
    /* toActions(steps) — back to the shape the legacy dispatch runner consumes. */
    function toActions(steps) {
      return (steps || []).map(function (s) {
        var cap = Caps.resolve(s.capabilityId);
        return Object.assign({ type: (cap && cap.legacy) || s.capabilityId }, s.args || {});
      });
    }

    /* ══ THE DEPENDENCY RUNNER (§12) ═════════════════════════════════════════════════════════════
       Steps with no unmet dependency run CONCURRENTLY unless they share a conflictKey; a step whose
       prerequisite failed does not run at all; a step that fails does not stop its independent
       siblings. `outputs` carries each step's result forward so `$ref` can read it — which is what
       stops the planner geocoding the same place once per step. */
    function resolveRefs(args, outputs) {
      if (!args || typeof args !== 'object') return args;
      if (Array.isArray(args)) return args.map(function (v) { return resolveRefs(v, outputs); });
      if (typeof args.$ref === 'string') {
        var m = REF_RE.exec(args.$ref);
        if (!m) return null;
        var src = outputs[m[1]];
        if (!src) return null;
        if (src.observed && src.observed[m[2]] !== undefined) return src.observed[m[2]];
        if (src[m[2]] !== undefined) return src[m[2]];
        return null;
      }
      var out = {};
      Object.keys(args).forEach(function (k) { out[k] = resolveRefs(args[k], outputs); });
      return out;
    }

    async function runPlan(steps, opts) {
      opts = opts || {};
      var results = Object.create(null), outputs = Object.create(null);
      var done = Object.create(null), skipped = Object.create(null);
      var order = [];
      var running = Object.create(null);
      var conflictBusy = Object.create(null);

      function ready(s) {
        if (done[s.id] || skipped[s.id] || running[s.id]) return false;
        return s.dependsOn.every(function (d) { return done[d] || skipped[d]; });
      }
      function prerequisiteFailed(s) {
        return s.dependsOn.some(function (d) {
          if (skipped[d]) return true;
          var r = results[d];
          return !r || (r.status !== 'completed' && r.status !== 'partial');
        });
      }
      function keysOf(s) {
        var c = Caps.resolve(s.capabilityId);
        return (c && c.effects.conflictKeys) || [];
      }

      var guard = 0;
      while (Object.keys(done).length + Object.keys(skipped).length < steps.length && guard++ < 400) {
        var batch = steps.filter(ready);
        if (!batch.length && !Object.keys(running).length) {
          steps.forEach(function (s) { if (!done[s.id] && !skipped[s.id]) skipped[s.id] = 'unreachable'; });
          break;
        }
        var launched = [];
        for (var i = 0; i < batch.length; i++) {
          var s = batch[i];
          if (prerequisiteFailed(s)) {
            if (s.onFailure === 'continue') { /* the author said an independent step may still go */ }
            else { skipped[s.id] = 'prerequisite_failed'; order.push(s.id); continue; }
          }
          var ks = keysOf(s);
          if (ks.some(function (k) { return conflictBusy[k]; })) continue;   /* serialise, next round */
          ks.forEach(function (k) { conflictBusy[k] = 1; });
          running[s.id] = 1;
          launched.push((function (step, keys) {
            var a = resolveRefs(step.args, outputs);
            return Exec.execute(step.capabilityId, a || {}, {
              source: opts.source || 'atlas', turnId: opts.turnId, signal: opts.signal
            }).then(function (r) {
              results[step.id] = r; outputs[step.id] = r; done[step.id] = 1; order.push(step.id);
              delete running[step.id]; keys.forEach(function (k) { delete conflictBusy[k]; });
              if (opts.onResult) { try { opts.onResult(step, r); } catch (_) { } }
              return r;
            });
          })(s, ks));
        }
        if (!launched.length && !Object.keys(running).length) break;
        await Promise.all(launched);
      }
      return {
        results: order.map(function (id) { return results[id] || null; }).filter(Boolean),
        byStep: results, skipped: skipped, order: order
      };
    }

    /* ══ CAPABILITY SELECTION FOR THE PROMPT (§10) ═══════════════════════════════════════════════
       「通常は関連度の高いCapability群を渡し、確信度が低い場合だけ対象範囲を広げてください。
         全能力を送るfallbackも残してください。」 Three settings, and the widest is everything. */
    function selectCapabilities(q, ctx) {
      var r = Caps.search(q, { context: ctx, want: 3, min: 8 });
      if (!r.ranked.length) return { ids: null, mode: 'all', reason: 'no-signal', q: q };
      if (!r.confident) {
        var wide = r.ranked.slice(0, 40).map(function (x) { return x.id; });
        if (wide.length < 12) return { ids: null, mode: 'all', reason: 'low-confidence', q: q };
        return { ids: wide, mode: 'wide', reason: 'low-confidence', q: q };
      }
      var ids = r.strong.map(function (x) { return x.id; });
      /* the near misses come too — a ranking is a hypothesis, and the cost of one more block is a
         few hundred bytes against the cost of a capability the model was never shown */
      r.ranked.slice(0, 24).forEach(function (x) { if (ids.indexOf(x.id) < 0) ids.push(x.id); });
      /* the fallbacks are always available, or "anything not listed" stops being reachable */
      ['system.control', 'system.module', 'dialog.answer', 'ui.inlineControls'].forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      return { ids: ids, mode: 'relevant', reason: 'confident', q: q };
    }

    return {
      /* ① the moved #R135 names, unchanged */
      _rpExtractYear: _rpExtractYear, _rpGeoKind: _rpGeoKind, _requestProfile: _requestProfile,
      _profileBlock: _profileBlock, ATLAS_ACTION_CAPABILITIES: _buildActionCapabilities(),
      _actionFamily: _actionFamily, _researchFamKey: _researchFamKey, _semanticRetryKey: _semanticRetryKey,
      _isWorldExpansion: _isWorldExpansion, _validatePlan: _validatePlan,
      _repairGuidance: _repairGuidance, _goalValidation: _goalValidation,
      /* ② the plan as a structure */
      PLAN_SCHEMA: PLAN_SCHEMA, goalSpec: goalSpec, evaluateGoal: evaluateGoal, goalImpact: goalImpact,
      validate: validate, normalize: normalize, toActions: toActions, resolveRefs: resolveRefs,
      runPlan: runPlan, selectCapabilities: selectCapabilities
    };
  })();
}
