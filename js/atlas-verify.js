/* ============================================================================
 *  IntMap · Atlas — code-side verification of an answer — content class, arithmetic, sources, mapping verdict  (#R199)
 * ----------------------------------------------------------------------------
 *  The #R150/#R156 commission: an answer is checked by CODE, not by trusting the model. Name
 *  normalisation and the confident-match gate, place extraction from the final text, exact-rational
 *  arithmetic verification (no floats), citation-domain audit, and the mapped/unplaced/ambiguous verdict.
 *  Every function here is pure and hermetically testable, which is exactly why it belongs outside the kernel.
 *
 *  Lifted out of js/atlas-console.js's 149-line block verbatim (#R199). It is a REAL ES module:
 *  nothing registers it on window.IntMapModules and nothing depends on load order — js/atlas-console.js
 *  names it in an `import`, so the bundler resolves the binding and orders the graph.
 *
 *  Everything the block used to read from the console's closure arrives through `CTX` (and the app's
 *  live host through `HOST`), rebound below under the ORIGINAL names so the body stays byte-identical.
 *  tests/r199-checks.test.mjs re-derives that byte-identity from the two files on every commit.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';   /* (#R452) Nominatim, with a clock — see the file header there */
import { NominatimGate } from './nominatim-gate.js';   /* (#R489) …and behind the app's ONE one-a-second floor — js/nominatim-gate.js */
import { makeAtlasGeoResolve } from './atlas-geo-resolve.js';   /* for its `featureNames` — the ONE rule for a Nominatim feature's names */

export function makeAtlasVerify(HOST, CTX) {
  const L=CTX.L, esc=CTX.esc;   /* ⚠ tests/r199 ② requires the CTX rebinds to be the factory's FIRST statement */
  const featureNames=makeAtlasGeoResolve.featureNames;   /* the ONE rule for a Nominatim feature's names — js/atlas-geo-resolve.js */
  /* (#R452) ONE geocode, and the whole pinning pass that awaits up to 24 of them in a file. Nominatim
     answers a client it has had enough of by not answering; without these two numbers the mapping
     self-check — which runs immediately before the answer is drawn — was the last unbounded await in
     the turn. ⚠ A place that could not be resolved in time is reported as `unplaced`, which is the
     verdict this audit already has for 「we could not put this on the map」; nothing is invented and
     nothing is hidden. */
  const GEOCODE_TIMEOUT_MS = 8000;
  const PINPASS_BUDGET_MS = 20000;
    /* ═══════════ (#R150 · Atlas research-mapping commission) CODE-SIDE VERIFICATION ═══════════
       A location-rich answer must deliver MAP value AND honestly reconcile its prose with the map — NOT rely on
       the model to emit a perfect structured list. The prior design (R149) pinned only the model's inline `places`
       list AND skipped entirely when any pin already existed, so: (a) if the model omitted the list → 0 pins;
       (b) an existing plan pin suppressed the whole audit; (c) a failure was swallowed by an empty catch. The
       redesign below is PURE + testable at its core and NEVER guesses a coordinate:
         · _atlNorm / _atlNameOk   — name normalization + confident-match gate (blocks "Roman"→"Roman, Romania").
         · _atlExtractPlaces       — pull the major real proper-noun spots out of the FINAL TEXT (safety net when
                                       the model under-supplies the list). Heuristic; only CONFIDENT geocodes pin.
         · _atlRegDomain / _atlAuditSources — normalize citation domains, detect single-domain concentration, flag
                                       official/primary (gov/mil/edu/int/go.jp/gob.*), so sources aren't one site.
         · _atlMappingVerdict      — pure: turn per-spot resolution outcomes into mapped / unplaced / ambiguous.
       Everything is exposed on IntMapAtlasDebug for the hermetic node tests (model-omitted list, partial placement,
       same-name ambiguity, one-domain sources, text/pins mismatch). No per-place hardcoding anywhere. */
    /* ⚠ (#R802) …AND RECOMPOSED AFTERWARDS, because the decomposition is a Latin device and this
       function is asked about Japanese every day. NFD splits 「ブ」 into 「フ」+ U+3099 (the combining
       voiced mark); the Latin sweep below only removes U+0300–U+036F, so the mark survived to the
       `[^\p{L}\p{N} ]` pass — where it is a Mark, not a Letter, and became a SPACE. Measured on this
       module: 「ブルンジ」 normalised to 「フ ルンシ」, 「プルンシ」 to the same string, so two different
       names shared one key and every Japanese name carried phantom word breaks into the dedupe and the
       name gate. NFC puts the Latin diacritics back nowhere (they were already deleted) and the kana
       back together. */
    function _atlNorm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').normalize('NFC')
      .replace(/^(the|a|an|la|le|el|los|las|les|der|die|das|il|lo)\s+/,'').replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim(); }
    function _atlNameOk(query, got){ const a=_atlNorm(query), b=_atlNorm(got); if(!a||!b) return false;
      if(a===b) return true; if(b.indexOf(a)===0||a.indexOf(b)===0) return true;
      const ta=a.split(' '), tb=new Set(b.split(' ')); return ta.length>=2 && ta.every(w=>tb.has(w)); }
    /* Extract candidate place names from prose. Over-captures (sentence-initial words, some person names) — precision
       is enforced downstream by the confident-geocode gate, so a non-place simply resolves to nothing and is dropped,
       never mis-pinned. Latin scripts only (CJK relies on the structured list + already-placed pins). */
    const _ATL_STOP=new Set('the this that these those it he she they we you i a an in on at by for from to as but and or however meanwhile today yesterday now here there its their his her our your my one two three first then also while when where what which who why how according reuters ap afp bbc cnn'.split(' '));
    /* Leading words that are sentence-initial verbs/adverbs, NEVER part of a place name — safe to strip from a
       multi-word candidate. Deliberately EXCLUDES directional/qualifier words (North/South/New/Old/Upper/Central…)
       because those ARE real place components ("North Korea", "New York", "Western Sahara") — stripping them corrupts. */
    const _ATL_LEAD=new Set('visit see explore discover today yesterday meanwhile however then also both either neither near around throughout during despite'.split(' '));
    /* (#R156) ================ CONTENT CLASS — the shared spine ================
       The model classifies each reply (and every attached image) into ONE content class. That SAME class then drives
       image fidelity, math self-check AND mapping — so a math/document/code answer NEVER runs place extraction (the
       "Problem"/"Thus"/"Let U and V" false-place bug is impossible because extraction is never even reached), while a
       genuinely geographic answer still maps. This is code-side enforcement, NOT prompt-trust: even if the model wrongly
       lists places on a math answer, _atlShouldMap('math') === false blocks every pin + note. An UNCLASSIFIED ('') reply
       stays mappable, so plain-text geographic answers are completely unchanged (no regression). */
    function _atlContentClass(x){ const s=String(x==null?'':x).toLowerCase().replace(/[^a-z]/g,'');
      if(!s) return '';
      if(/(math|equation|formula|algebra|calculus|matrix|matrices|proof|geometry|trig|physics|chemis|scienti|statistic)/.test(s)) return 'math';
      if(/(code|program|software|snippet|shell|script|sql|json|html|css|javascript|python)/.test(s)) return 'code';
      if(/(document|table|form|receipt|invoice|spreadsheet|ledger|ocr|handwrit|textextract|paper|article|essaytext)/.test(s)) return 'document';
      if(/(grammar|translat|languagelearn|spelling|proofread|writing|essay)/.test(s)) return 'language';
      if(/(geograph|^geo$|map|place|location|landmark|city|country|region|terrain|facility|travel|street|address|nature|landscape)/.test(s)) return 'geographic';
      if(/(photo|image|picture|screenshot|^ui$|interface|diagram|chart|graph|artwork|meme|logo)/.test(s)) return 'photo';
      if(/(concept|explain|general|knowledge|conversation|advice|medic|pharma|health|history|abstract|opinion)/.test(s)) return 'conceptual';
      return s; }
    function _atlShouldMap(cls){ const c=_atlContentClass(cls); return c==='geographic'||c===''; }
    /* (#R156) EXACT-RATIONAL deterministic verification (BigInt fractions → 1/22 etc. are exact, no float error). The
       vision/answer model returns a `checks` array of INDEPENDENTLY computable facts (chiefly matrix products, e.g.
       V·P = U for a transition-matrix problem); the client recomputes them and reports pass/fail. This is the work
       order's "計算可能な問題は決定論的に検算する / 一致しなければ画像の該当箇所を再確認する" — real verification, not the model
       grading itself. Unsupported/ill-formed checks are SKIPPED (never a false "verified"); a failure triggers ONE
       image re-examination round in the vision turn. */
    function _atlGcd(a,b){ a=a<0n?-a:a; b=b<0n?-b:b; while(b){ const t=a%b; a=b; b=t; } return a||1n; }
    function _atlRat(n,d){ try{ n=BigInt(n); d=(d===undefined?1n:BigInt(d)); }catch(_){ return null; } if(d===0n) return null; if(d<0n){ n=-n; d=-d; } const g=_atlGcd(n,d); return {n:n/g,d:d/g}; }
    function _atlDecRat(s){ const neg=/^-/.test(s); s=s.replace(/^[+-]/,''); const p=s.split('.'); const intp=p[0]||'0', frac=p[1]||''; return _atlRat((neg?-1n:1n)*BigInt((intp+frac)||'0'), 10n**BigInt(frac.length)); }
    function _atlParseRat(x){ if(x==null) return null;
      if(typeof x==='number'){ if(!isFinite(x)) return null; return Number.isInteger(x)?_atlRat(x,1):_atlDecRat(String(x)); }
      let s=String(x).trim().replace(/\\!|\\,|\s|\{|\}|\$/g,''); if(!s) return null;
      let m=s.match(/^\\?d?frac([+-]?\d+)([+-]?\d+)$/); if(m) return _atlRat(BigInt(m[1]),BigInt(m[2]));   /* \frac{a}{b} after brace-strip → "fracab"; simple a,b only */
      m=s.match(/^([+-]?\d+)\/([+-]?\d+)$/); if(m) return _atlRat(BigInt(m[1]),BigInt(m[2]));
      if(/^[+-]?\d+$/.test(s)) return _atlRat(BigInt(s),1n);
      if(/^[+-]?(?:\d+\.\d*|\.\d+|\d+)$/.test(s)&&/\./.test(s)) return _atlDecRat(s);
      return null; }
    const _rAdd=(a,b)=>_atlRat(a.n*b.d+b.n*a.d, a.d*b.d), _rMul=(a,b)=>_atlRat(a.n*b.n, a.d*b.d), _rEq=(a,b)=>!!a&&!!b&&a.n===b.n&&a.d===b.d;
    function _atlParseMat(M){ if(!Array.isArray(M)||!M.length||M.length>16) return null; const out=[]; let cols=-1;
      for(const row of M){ const r0=Array.isArray(row)?row:[row]; if(cols<0) cols=r0.length; if(!r0.length||r0.length!==cols||r0.length>16) return null;
        const r=[]; for(const c of r0){ const q=_atlParseRat(c); if(!q) return null; r.push(q); } out.push(r); }
      return out; }
    function _atlMatMul(A,B){ const n=A.length,k=A[0].length,m=B[0].length; if(B.length!==k) return null; const C=[];
      for(let i=0;i<n;i++){ const row=[]; for(let j=0;j<m;j++){ let s=_atlRat(0,1); for(let t=0;t<k;t++){ s=_rAdd(s,_rMul(A[i][t],B[t][j])); if(!s) return null; } row.push(s); } C.push(row); } return C; }
    function _atlMatEq(A,B){ if(!A||!B||A.length!==B.length) return false; for(let i=0;i<A.length;i++){ if(A[i].length!==B[i].length) return false; for(let j=0;j<A[i].length;j++){ if(!_rEq(A[i][j],B[i][j])) return false; } } return true; }
    function _atlVerifyChecks(checks){ const out={ran:0,passed:0,failed:[]}; if(!Array.isArray(checks)) return out;
      for(const c of checks.slice(0,12)){ try{ if(!c||!c.type) continue; const type=String(c.type).toLowerCase().replace(/[^a-z]/g,''); const label=String(c.label||c.desc||c.name||type).slice(0,120);
        if(/(matmul|matrixproduct|matrixmultiply|verifyinverse|verifysystem|productequals)/.test(type)){
          const A=_atlParseMat(c.a||c.A||c.left), B=_atlParseMat(c.b||c.B||c.right), E=_atlParseMat(c.expect||c.equals||c.result||c.u||c.U);
          if(!A||!B||!E) continue; const P=_atlMatMul(A,B); if(!P) continue; out.ran++; if(_atlMatEq(P,E)) out.passed++; else out.failed.push({label, detail:'A·B ≠ expected'}); }
        else if(/(mateq|matrixequal|equalmatrix)/.test(type)){ const A=_atlParseMat(c.a||c.A||c.left), B=_atlParseMat(c.b||c.B||c.right||c.expect); if(!A||!B) continue; out.ran++; if(_atlMatEq(A,B)) out.passed++; else out.failed.push({label, detail:'matrices differ'}); }
        else if(/(equal|scalar|value|arith|calc)/.test(type)){ const lv=_atlParseRat(c.left!=null?c.left:c.a), rv=_atlParseRat(c.right!=null?c.right:(c.expect!=null?c.expect:(c.equals!=null?c.equals:c.b))); if(!lv||!rv) continue; out.ran++; if(_rEq(lv,rv)) out.passed++; else out.failed.push({label, detail:'values differ'}); }
      }catch(_){} }
      return out; }
    function _atlChecksNoteHtml(v){ if(!v||!v.ran) return '';
      if(!v.failed.length) return '<div class="atl-check ok" style="font-size:11px;margin-top:8px;color:#2ea043;display:flex;gap:6px;align-items:flex-start;"><span>✓</span><span>'+esc(L(
        v.passed+' computation'+(v.passed===1?'':'s')+' verified independently (exact arithmetic).',
        v.passed+' 件の計算をクライアント側で独立に検算しました（厳密計算・一致）。',
        v.passed+' Berechnung'+(v.passed===1?'':'en')+' unabhängig verifiziert (exakte Arithmetik).',
        v.passed+' вычислени'+(v.passed===1?'е':'й')+' проверено независимо (точная арифметика).',
        v.passed+' cálculo'+(v.passed===1?'':'s')+' verificado(s) de forma independiente (aritmética exacta).'))+'</span></div>';
      return '<div class="atl-check bad" style="font-size:11px;margin-top:8px;color:#d29922;display:flex;gap:6px;align-items:flex-start;"><span>⚠</span><span>'+esc(L(
        'An independent re-computation did NOT match ('+v.failed.map(f=>f.label).join('; ')+') — the transcription or a step may be wrong; treat the result with caution.',
        '独立した再計算が一致しませんでした（'+v.failed.map(f=>f.label).join('; ')+'）。読み取りまたは計算の一部が誤っている可能性があるため、結果は慎重にご確認ください。',
        'Eine unabhängige Nachrechnung stimmte NICHT überein ('+v.failed.map(f=>f.label).join('; ')+') — Transkription/Schritt evtl. falsch.',
        'Независимый пересчёт НЕ совпал ('+v.failed.map(f=>f.label).join('; ')+') — возможна ошибка в распознавании или вычислении.',
        'Un recálculo independiente NO coincidió ('+v.failed.map(f=>f.label).join('; ')+') — la transcripción o un paso puede ser erróneo.'))+'</span></div>'; }
    /* ⚠⚠⚠ (#R802) A NAME IS NOT ITS POSSESSIVE, AND A PERIOD IS NOT ALWAYS A SENTENCE END.
       Measured on production 2026-09-18 (build 2026-09-18-R783), both printed under 「本文に登場したが
       未配置（正確に特定できませんでした）」 — the line that tells the reader IntMap could not locate a place:
         · 「Lake Baikal's water surface area is 31,722 km²…」 → «Lake Baikal's». The possessive travelled
           into the geocoder, which holds no feature spelled that way, while the same answer's two real
           pins were already on the map.
         · 「…Dujuan (JMA Typhoon No. 25 / 2625)…」 → «JMA Typhoon No». A storm designation, cut in half at
           its own abbreviation and then reported to the reader as a place that could not be found.
       THE JUDGEMENTS ARE FORMS, NOT A LIST OF ABBREVIATIONS (.agents/rules/no-ad-hoc-hardcoding.md §1):
         ① a period straight after a CONTRACTION — an initial-capital token of at most four letters with
            no vowel after the first (St. Mt. Ft. Pt. Dr. Mrs. Hwy.) — belongs to the abbreviation, so a
            phrase CONTINUES across it and 「St. Petersburg」/「Mt. Fuji」 stay whole. ⚠ THE VOWEL CONDITION
            IS WHAT KEEPS AN ORDINARY SHORT WORD OUT: 「…the Red Sea. The Nile…」 must stay two things, and
            joining it would manufacture exactly the kind of non-place phrase this round is removing.
            Every other period still ends the phrase — and the scan RESUMES at it, so the names in the
            next sentence are read exactly as they were before (the 「Italy. The Colosseum」 rule).
         ② a period followed by a DIGIT opens a numbered construct (「No. 25」, 「Fig. 3」), and a name cannot
            hold a number — so a phrase that ENDS at one is a fragment. It is dropped here, before a
            geocoder is spent on it and before the reader can be told it is a place we failed to locate.
       ⚠ THE APOSTROPHE STAYS INSIDE THE WORD: Coeur d'Alene, N'Djamena and Xi'an are real names spelled
       with one. Only a TRAILING 's / ’s is dropped, and `_atlNameOk` accepts the shortened form against
       the full one in both directions, so 「St John's」 still agrees with itself through 「St John」. */
    const _ATL_ABBR_SHAPE=/^[A-ZÀ-Þ][\p{L}]{0,3}$/u, _ATL_VOWEL=/[aeiouàáâãäåæèéêëìíîïòóôõöøùúûü]/i;
    const _atlLastTok=(s)=>(String(s==null?'':s).match(/[^\s]+$/)||[''])[0];
    function _atlContraction(tok){ return _ATL_ABBR_SHAPE.test(tok) && !_ATL_VOWEL.test(tok.slice(1)); }
    /* Is this string shaped like a NAME at all? Asked of the name itself, so the two readers that must
       act on the answer get the same one: the extractor must not spend a lookup on it, and the verdict
       must not accuse it of being a place IntMap could not find. The consequences differ, which is why
       both ask rather than one trusting the other. */
    function _atlPlaceNameLike(name){ const s=String(name==null?'':name).trim(); if(!s) return false;
      if(/\d/.test(s)) return false;                       /* a figure is part of a construct, not of a name this pass can extract */
      const last=_atlLastTok(s);
      return !/\.$/.test(last) && !/['’]s$/.test(last); }   /* …and neither an abbreviation nor a possessive can END one */
    function _atlExtractPlaces(text){ let t=String(text||'').replace(/`[^`]*`/g,' ').replace(/https?:\/\/\S+/g,' ').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1');
      /* a phrase never bridges a sentence boundary ("Italy. The Colosseum") — #R726 got that by keeping
         '.' out of the class entirely, and #R802 keeps the SAME property while letting an abbreviation's
         period through: a period that does not belong to a contraction cuts the phrase below, and the
         scan is rewound to it, so what the reader's text yields either side of a full stop is unchanged.
         Only SPACES join the words (not \s) → a phrase never bridges a LINE either. The answer's
         plain text joins a heading and its first paragraph with a newline, and `\s+` walked straight
         across it: «## Nominal GDP» + «The latest…» became the candidate «Nominal GDP The», which was
         then sent to a geocoder and printed under «not placed» (measured on production, 2026-09-15). */
      /* (#R802) `\.?` before each join is the abbreviation period of ① above; a period that is NOT one
         is cut out of the match below and the scan is rewound to it, so the sentence rule is unchanged. */
      const re=/[A-ZÀ-Þ][\p{L}'’\-]*(?:\.?[ \t]+(?:of|de|del|della|di|du|des|da|do|dos|van|von|la|le|los|las|el|al|the|and|upon|on)[ \t]+[A-ZÀ-Þ][\p{L}'’\-]*|\.?[ \t]+[A-ZÀ-Þ][\p{L}'’\-]*){0,3}/gu;
      const seen=new Set(), out=[]; let m;
      while((m=re.exec(t))){ let raw=m[0], cut=-1;
        const dots=/\.(?=[ \t])/g; let d;
        while((d=dots.exec(raw))){ if(!_atlContraction(_atlLastTok(raw.slice(0,d.index)))){ cut=d.index; break; } }   /* the first period that ends a SENTENCE ends the phrase */
        if(cut>=0){ raw=raw.slice(0,cut); re.lastIndex=m.index+cut+1; }   /* …and the next sentence is scanned from there, so nothing after the period is skipped */
        const after=t.slice(m.index+raw.length);
        if(cut<0 && /^\.[ \t]*\d/.test(after) && _ATL_ABBR_SHAPE.test(_atlLastTok(raw))) continue;   /* 「JMA Typhoon No. 25」 — the construct continues into a number, so this is a fragment (② above) */
        let s=raw.replace(/[.,;:]+$/,'').replace(/['’]s$/,'').replace(/['’]+$/,'').trim(); if(s.length<3) continue;   /* 「Lake Baikal's」 → 「Lake Baikal」; an apostrophe INSIDE the word is untouched */
        let toks=s.split(/\s+/); while(toks.length>1 && _ATL_LEAD.has(toks[0].toLowerCase())) toks=toks.slice(1); s=toks.join(' ');   /* drop a sentence-initial verb/adverb prefix */
        if(toks.length===1 && _ATL_STOP.has(s.toLowerCase())) continue;
        if(!_atlPlaceNameLike(s)) continue;
        const key=_atlNorm(s); if(!key||key.length<3||seen.has(key)) continue; seen.add(key); out.push(s); if(out.length>=24) break; }
      return out; }
    function _atlRegDomain(url){ let h=''; try{ h=new URL(String(url)).hostname.toLowerCase(); }catch(_){ h=String(url||'').toLowerCase().replace(/^.*\/\//,'').split('/')[0]; }
      h=h.replace(/^www\d?\./,''); const p=h.split('.').filter(Boolean); if(p.length<=2) return h;
      const two=new Set(['co','com','org','net','gov','gob','gouv','go','ac','edu','or','ne','mil']);
      return (two.has(p[p.length-2])) ? p.slice(-3).join('.') : p.slice(-2).join('.'); }
    function _atlIsOfficial(dom){ return /(^|\.)(gov|mil|int)(\.[a-z]{2,3})?$/.test(dom)||/\.(gov|gob|gouv|go|gc|edu|ac)\.[a-z]{2,3}$/.test(dom)||/\.(edu|int)$/.test(dom); }
    function _atlAuditSources(cites){ const urls=(Array.isArray(cites)?cites:[]).map(c=>String((c&&(c.url||c))||'')).filter(u=>/^https?:\/\//i.test(u));
      const by={}; urls.forEach(u=>{ const d=_atlRegDomain(u); if(d) by[d]=(by[d]||0)+1; });
      const domains=Object.keys(by); const total=urls.length; let dominant='',dmax=0; domains.forEach(d=>{ if(by[d]>dmax){ dmax=by[d]; dominant=d; } });
      const official=domains.filter(_atlIsOfficial);
      const concentrated = total>=2 && (domains.length===1 || (dmax/total)>=0.75 && domains.length<=2);
      return { total, distinct:domains.length, byDomain:by, dominant, dominantShare:total?dmax/total:0, official, concentrated }; }
    /* PURE: fold per-spot resolution outcomes into the three honest buckets. `spots`=[{name,src,verdict}] where
       verdict ∈ mapped|unplaced|ambiguous. Text-source unplaced items are only surfaced when multi-word (a lone
       failed capitalized token is far more likely a non-place than a spot we failed to map — don't cry wolf). */
    /* ⚠⚠ (#R545) AN UNPLACED PLACE CARRIES WHY IT IS UNPLACED. 「正確に特定できませんでした」 was
       printed for four different things — a name the geocoders genuinely could not resolve, the 14-pin
       cap, the pass deadline, and a lookup that never came back — so the one sentence the reader got
       was true for one of them and a false accusation against the place for the other three. The
       reasons are the ones this pass can actually tell apart at the moment it gives up. 「unplaced」
       still lists every one of them, so nothing a caller could already read has changed shape. */
    const _ATL_UNPLACED_REASONS=['not_found','budget','infra'];
    function _atlMappingVerdict(spots){ const mapped=[],unplaced=[],ambiguous=[];
      const by={}; _ATL_UNPLACED_REASONS.forEach(r=>{ by[r]=[]; });
      (Array.isArray(spots)?spots:[]).forEach(s=>{ if(!s||!s.name) return;
      if(s.verdict==='mapped') mapped.push(s.name);
      /* ⚠ The «lone capitalised token is weak evidence» rule is a fact about the TEXT source, not about
         one verdict — so it applies to `ambiguous` exactly as it applies to `unplaced`. Before this it
         applied to `unplaced` only, and the reader was shown «Ambiguous (several places share this
         name): JST, Available, Providing» — sentence-initial words of an ISS answer that Nominatim
         happens to know as a shop somewhere (measured on production, 2026-09-15). A structured
         place, which the model named on purpose, is still surfaced whatever its length. */
      /* ⚠ (#R802) …AND THE SAME IS TRUE OF 「IS THIS SHAPED LIKE A NAME AT ALL」. 「not placed (couldn't
         locate precisely)」 is a claim about the WORLD — that IntMap does not know this place — and it
         was made about 「Lake Baikal's」 and 「JMA Typhoon No」, which are not places at all. A prose
         candidate that never looked like a name is dropped in silence; a prose candidate that DID and
         could not be resolved is still reported, exactly as before. A structured place, which the model
         named on purpose, is untouched by this. */
      else if(s.verdict==='ambiguous'){ if(s.src==='structured' || (/\s/.test(s.name)&&_atlPlaceNameLike(s.name))) ambiguous.push(s.name); }
      else if(s.verdict==='unplaced'){ if(s.src==='structured' || (/\s/.test(s.name)&&_atlPlaceNameLike(s.name))){ unplaced.push(s.name);
        by[_ATL_UNPLACED_REASONS.indexOf(s.reason)>=0?s.reason:'not_found'].push(s.name); } } });   /* text-source: only multi-word failures are surfaced (a lone capitalized word is likely not a place — don't cry wolf) */
      return { mapped, unplaced, ambiguous, unplacedBy: by }; }
    function _atlMappingNoteHtml(v, src, meta){ meta=meta||{}; let h='';
      const n=v.mapped.length;
      if(n) h+='<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">📍 '+L(
        n+' place'+(n===1?'':'s')+' from this answer mapped — tap a pin for details',
        '本文の主要スポット '+n+' 件を地図にマッピングしました（ピンをタップで詳細）',
        n+' Ort'+(n===1?'':'e')+' aus dieser Antwort auf der Karte — Pin antippen',
        'На карте '+n+' объект(ов) из этого ответа — нажмите метку',
        n+' lugar'+(n===1?'':'es')+' de esta respuesta en el mapa — toca un pin')+'</div>';
      if(v.ambiguous.length) h+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;opacity:.85;">'+L('Ambiguous (several places share this name — not placed): ','曖昧（同名地が複数あり未配置）: ','Mehrdeutig (nicht verortet): ','Неоднозначно (не размещены): ','Ambiguo (sin ubicar): ')+esc(v.ambiguous.slice(0,6).join(', '))+(v.ambiguous.length>6?'…':'')+'</div>';
      /* (#R545) ONE LINE PER CAUSE. `unplacedBy` is absent only for a verdict built by an older
         caller — then everything falls back into the cause the note used to name for all four. */
      const _by=(v&&v.unplacedBy)||{not_found:v.unplaced.slice()};
      const _uline=(names,label)=>{ if(!names||!names.length) return '';
        return '<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;opacity:.85;">'+label+esc(names.slice(0,6).join(', '))+(names.length>6?'…':'')+'</div>'; };
      h+=_uline(_by.not_found,L('Named in the answer but not placed (couldn’t locate precisely): ','本文に登場したが未配置（正確に特定できませんでした）: ','Genannt, aber nicht verortet: ','Упомянуты, но не размещены: ','Mencionados pero sin ubicar: '));
      h+=_uline(_by.budget,L('Named in the answer but not placed (this answer reached its lookup limit — not a judgement about the place): ','本文に登場したが未配置（今回の照会上限に達したためで、その地点を特定できないという意味ではありません）: ','Genannt, aber nicht verortet (Abfragelimit dieser Antwort erreicht): ','Упомянуты, но не размещены (достигнут лимит запросов для этого ответа): ','Mencionados pero sin ubicar (esta respuesta alcanzó su límite de búsquedas): '));
      h+=_uline(_by.infra,L('Named in the answer but not placed (the map lookup did not answer — not a judgement about the place): ','本文に登場したが未配置（地図検索が応答しなかったためで、その地点を特定できないという意味ではありません）: ','Genannt, aber nicht verortet (Kartensuche antwortete nicht): ','Упомянуты, но не размещены (поиск по карте не ответил): ','Mencionados pero sin ubicar (la búsqueda en el mapa no respondió): '));
      if(meta.infraFail && !n) h+='<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;opacity:.85;">'+L('Map lookup was unavailable — places could not be verified on the map right now.','地図検索が利用できず、地点を地図上で検証できませんでした。','Kartensuche nicht verfügbar.','Поиск по карте недоступен.','La búsqueda en el mapa no está disponible.')+'</div>';
      if(src && src.concentrated && !src.official.length) h+='<div style="font-size:10.5px;color:var(--warn-color,#c98a00);margin-top:4px;opacity:.95;">⚠ '+L(
        'Sources here concentrate on one site ('+esc(src.dominant)+') — treat with caution and seek an independent or official source.',
        '出典が1サイト（'+esc(src.dominant)+'）に集中しています。独立した情報源や公的情報での裏取りを推奨します。',
        'Quellen konzentrieren sich auf eine Seite ('+esc(src.dominant)+') — mit Vorsicht behandeln.',
        'Источники сосредоточены на одном сайте ('+esc(src.dominant)+') — проверьте по независимому источнику.',
        'Las fuentes se concentran en un sitio ('+esc(src.dominant)+') — verifica con una fuente independiente.')+'</div>';
      return h; }
    /* Strict geocode with ambiguity detection (limit=5). Returns {ok,lng,lat,name} | {ok:false,reason,ambiguous?}.
       Only place-type, name-matching results count; ≥2 distinct locations with no country hint = ambiguous (not placed). */
    async function _atlGeocodeStrict(name, country){ name=String(name||'').trim(); if(name.length<2) return {ok:false,reason:'empty'};
      const q=[name,String(country||'').trim()].filter(Boolean).join(', '); let arr=null;
      /* ⚠ `namedetails=1`, and the name is checked against EVERY name the feature carries — not against
         the first segment of `display_name`, which Nominatim writes in the language of the browser's
         Accept-Language. In a Japanese browser an English answer's «Tokyo» came back as «東京都» and
         «United States» as «アメリカ合衆国», neither of which the English query could match, so the two
         best-known places on Earth were printed under «couldn't locate precisely» (measured on
         production, 2026-09-15). The label the reader sees is unchanged: it is still the first
         segment of display_name, in the reader's language. The list of a feature's names is
         js/atlas-geo-resolve.js's exported `featureNames` (name, localised label, every namedetails
         name:*) — one rule, imported, not a second copy. */
      try{ await NominatimGate.nominatimSlot(); arr=await jsonWithin('https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&namedetails=1&limit=5&q='+encodeURIComponent(q),GEOCODE_TIMEOUT_MS,{headers:{Accept:'application/json'}}); }
      catch(e){ return {ok:false,reason:'network'}; }   /* (#R452) …and the deadline lands here too: in both cases nothing arrived */
      if(!Array.isArray(arr)||!arr.length) return {ok:false,reason:'not_found'};
      const matches=arr.filter(j=>{ const okType=/^(place|boundary|natural|waterway|landuse|tourism|historic|leisure|amenity)$/.test(String(j.class||''))||!!j.addresstype; return okType && featureNames(j).some(n=>_atlNameOk(name,n)); });
      if(!matches.length) return {ok:false,reason:'no_name_match'};
      const cells=new Set(); matches.forEach(j=>cells.add(Math.round(+j.lat*10)+','+Math.round(+j.lon*10)));
      if(!country && cells.size>=2) return {ok:false,reason:'ambiguous',ambiguous:true};
      const b=matches[0]; return { ok:true, lng:+b.lon, lat:+b.lat, name:(b.display_name||'').split(',')[0] }; }
    /* ══ ⚠⚠⚠ (#R802) THE STORE THAT ALREADY HOLDS EVERY COUNTRY'S NAME IN THE READER'S LANGUAGE ══════
       Measured on production 2026-09-18: 「アフリカで最も長い河川の流路を地図に描いて、流域国を列挙して。」
       was answered in Japanese and the audit printed 「本文に登場したが未配置（正確に特定できませんでした）:
       ブルンジ, コンゴ民主共和国, エリトリア, エチオピア, ルワンダ, 南スーダン…」 — eleven countries whose
       boundary, label point and Japanese name IntMap ships. The ladder went ledger → region geocoder →
       strict Nominatim and never asked its OWN store, and both network rungs failed for reasons that say
       nothing about the country:
         · `geocode('ブルンジ')` does return the right relation (measured live: 1 hit, `name:ja`=ブルンジ),
           but the rung then compares the query against the ONE label the geocoder hands back — 'Burundi',
           in whatever language the request asked for — and `_atlNameOk('ブルンジ','Burundi')` is false, as
           it must be: those are not the same string.
         · the strict rung then asks for 「name, country」, and for a COUNTRY the model fills `country` with
           the country itself. Measured live 2026-09-18: 'ブルンジ' → 1 hit; 'ブルンジ, ブルンジ' → 0 hits. No
           hits is `not_found`, which is the sentence the reader was shown.
       ⚠ THE NAMES ARE NOT A TABLE WRITTEN HERE. `countryStats` carries `nameEn`/`nameJp` (Natural Earth's
       NAME_EN / NAME_JA — measured: NAME_JA answers every one of the eleven, including 「南極大陸」 and
       「コンゴ民主共和国」) and `a2`, which is the key `window._imCldrRegion` reads CLDR with — the app's ONE
       rule for naming a country in a language (js/countries-ui.js) — for every language
       `window.IntMapLang.codes()` declares. A country added to the store tomorrow answers in all nine the
       day it arrives, and nothing is spelled here. A spelling two countries claim identifies neither, the
       way js/atlas-country-ids.js drops an ambiguous identifier.
       ⚠ WHY IT SITS ABOVE THE NETWORK RUNGS: the answer it gives is the app's own label point — the one
       the Countries panel flies to — it costs no request and no share of the pass budget, and for a bare
       country name the geocoder was returning that same country anyway.
       Expires when: `countryStats` stops carrying `a2`/`latlng`, or `_imCldrRegion` stops being how this
       app names a country. */
    let _ctryIdx=null, _ctryFor=null, _ctryN=-1;
    function _atlCountryIndex(){
      const store=(HOST&&HOST.countryStats)||null; if(!store) return null;
      const n=Object.keys(store).length; if(!n) return null;
      if(_ctryIdx&&_ctryFor===store&&_ctryN===n) return _ctryIdx;   /* the store is filled IN PLACE as each scale lands, so the key count is what changes */
      let langs=[]; try{ langs=(window.IntMapLang&&window.IntMapLang.codes&&window.IntMapLang.codes())||[]; }catch(_){ langs=[]; }
      const map=new Map(), dup=new Set();
      const put=(nm,code)=>{ if(typeof nm!=='string') return; const k=_atlNorm(nm); if(!k||k.length<2) return;
        const prev=map.get(k); if(prev!==undefined&&prev!==code){ dup.add(k); return; } map.set(k,code); };
      for(const code in store){ const s=store[code]; if(!s||!s.latlng) continue;
        const names=[s.nameEn,s.nameJp];
        if(s.a2){ for(const lg of langs){ try{ const cn=window._imCldrRegion&&window._imCldrRegion(s.a2,lg); if(cn) names.push(cn); }catch(_){} } }
        names.forEach(nm=>{ put(nm,code);
          /* CLDR disambiguates with a parenthetical — 「コンゴ民主共和国(キンシャサ)」 is the same country the
             answer calls 「コンゴ民主共和国」 — so the form without it is the same country's name too. */
          const bare=String(nm==null?'':nm).replace(/[(（][^)）]*[)）]/g,' ').trim(); if(bare&&bare!==nm) put(bare,code); }); }
      dup.forEach(k=>map.delete(k));
      _ctryIdx=map; _ctryFor=store; _ctryN=n; return map; }
    /** name → the country's own label point, or null. EXACT agreement on a whole name only: a prefix
        rule here would answer 「South」 with South Africa. */
    function _atlCountryPoint(name){ try{ const idx=_atlCountryIndex(); if(!idx) return null;
      const code=idx.get(_atlNorm(name)); if(!code) return null; const s=HOST.countryStats[code]; if(!s||!s.latlng) return null;
      const lng=+s.latlng[1], lat=+s.latlng[0]; if(!isFinite(lng)||!isFinite(lat)) return null;
      let nm=''; try{ nm=(HOST.cName?HOST.cName(s):'')||''; }catch(_){}   /* the country's name in the reader's language, by the app's own rule */
      return {lng, lat, name:nm||s.nameEn||code, code}; }catch(_){ return null; } }
    /* ══ (#R397) THE ORCHESTRATOR, MOVED IN FROM js/atlas-console.js ═══════════════════════════════
       It resolves the answer's places, merges with the pins the plan already dropped, pins only the
       confident unique hits, and returns the honest self-audit note. It came here because EIGHT of
       its thirteen dependencies were already in this file — `_atlShouldMap`, `_atlNorm`,
       `_atlExtractPlaces`, `_atlGeocodeStrict`, `_atlNameOk`, `_atlMappingVerdict`,
       `_atlMappingNoteHtml`, `_atlAuditSources` — so the console was reaching back across the seam
       for every one of them, and because js/atlas-console.js has a SHRINK-ONLY line ceiling
       (tests/r199 ⑤ and the stricter tests/r318 ⑨b, «must stay below 5,270»). #R397 adds a subject
       to the shell, so the shell gives one up: the same trade #R199, #R313 and #R318 each made.

       The five that could not come are passed in: `geocode` (the region resolver's, not this file's
       strict one), `paintPois` / `getPois` / `setPois` (the console owns the POI array and REPLACES
       it, so a captured copy would go stale — #R320's lesson in js/app-body.js), `GE` and `GEOBJ`.

       ⚠ WHAT CHANGED WHILE MOVING, AND WHAT DID NOT. The three #R397 fixes are here — coordinates
       survive the mapper, `alreadyMapped` asks three ways instead of one, and an arrived point-like
       coordinate is not re-resolved. Nothing else was touched: the #R156 content-class gate, the
       14-pin budget, the 0.05° cell dedupe, the 5×500 ms paint retry and the fit-bounds-only-when-
       empty rule are the lines that stood in the console, character for character. */
    function makePinReplyPlaces(D) {
      const geocode = D.geocode, paintPois = D.paintPois, getPois = D.getPois, setPois = D.setPois;
      /* ⚠ (#R489) THIS PASS IS WHERE THE CONVERSATION LEARNS ITS PLACES. It already walks every place
         an answer named, resolves each one, and knows the country and the kind the model declared —
         and then it threw all of that away the moment the pins were drawn, because the only thing a
         turn left behind was js/atlas-turn-continuity.js's 26-character label. So the next turn
         re-extracted fourteen oblast names out of its own prose and geocoded them again, one by one,
         in the language the reader happened to have typed. Recording here closes that loop, and
         reading here means a name resolved a moment ago is not sent to Nominatim a second time.
         ⚠ OPTIONAL: without a ledger this file behaves exactly as it did (the node checks). */
      const ledger = D.ledger || null;
      const GE = D.GE, GEOBJ = D.GEOBJ, L = D.L;
      return async function _pinReplyPlaces(places, ctx){ ctx=ctx||{}; const text=String(ctx.text||'');
      /* (#R156) CODE-SIDE GEO GATE — 「地図化の有無をモデルのプロンプト遵守だけに依存させず、コード側で
         検証する / 数学・コード・文書モードでは地点抽出処理自体を呼ばない」. A non-geographic content class
         (math/code/document/photo/language/conceptual) returns immediately: NO place extraction, NO
         geocoding, NO pins and NO "0 places / unplaced / ambiguous" note, so a math answer containing
         capitalised words like "Problem" or "Let U and V" can never become map candidates. */
      if(ctx.contentClass && !_atlShouldMap(ctx.contentClass)) return '';
      try{
        /* ⚠⚠⚠ (#R397) THIS MAPPER USED TO DROP THE COORDINATE — it read name/country/kind/summary and
           NOTHING ELSE, so a place that arrived already located was geocoded again and reported as
           「未配置」 whenever the second lookup was stricter. Full account: js/atlas-geo-object.js. */
        const struct=(Array.isArray(places)?places:[]).slice(0,16).map(p=>{
          const g=GEOBJ.geoObject(p);
          return { name:g.name.slice(0,90), country:g.country.slice(0,60), kind:g.kind.slice(0,40),
            summary:g.summary.slice(0,240), lng:g.lng, lat:g.lat, provenance:g.provenance, src:'structured' };
        }).filter(it=>it.name&&it.name.length>1);
        const structKeys=new Set(struct.map(it=>_atlNorm(it.name)));
        const textBudget=struct.length?4:8;   /* text extraction is the SAFETY NET — used hard only when the model under-supplied the list */
        const textCands=_atlExtractPlaces(text).filter(s=>!structKeys.has(_atlNorm(s))).slice(0,textBudget).map(s=>({name:s,country:'',kind:'',summary:'',src:'text'}));
        const _pois=getPois();
        if(!struct.length && textCands.length<2 && !(Array.isArray(_pois)&&_pois.length)) return '';   /* not a place-rich answer — don't geocode incidental capitalized words */
        const pre=(Array.isArray(_pois)?_pois:[]).map(p=>({lng:+p.lng,lat:+p.lat,name:String(p.name||''),kind:String(p.kind||''),sum:String(p.sum||''),url:String(p.url||''),src:String(p.src||'')})).filter(p=>isFinite(p.lng));
        const preKeys=new Set(pre.map(p=>_atlNorm(p.name)).filter(Boolean));
        const seenCell=new Set(pre.map(p=>Math.round(p.lng*20)+','+Math.round(p.lat*20)));
        /* (#R397) «already on the map?» asked THREE ways, not one: exact name alone left a pin reading
           «14 km SSW of X» unrecognised against prose saying «X», so it was geocoded again. */
        const alreadyMapped=(it)=>{
          const key=_atlNorm(it.name);
          if(key&&preKeys.has(key)) return true;
          if(GEOBJ.placed(it)&&seenCell.has(Math.round(it.lng*20)+','+Math.round(it.lat*20))) return true;
          const n=GEOBJ.normName(it.name);
          if(n.length>=3){ for(const p of pre){ const pn=GEOBJ.normName(p.name); if(pn.length>=3&&(pn.indexOf(n)>=0||n.indexOf(pn)>=0)) return true; } }
          return false; };
        const spots=[]; const newPins=[]; let infraFail=0;
        /* ⚠⚠⚠ (#R452) THIS LOOP AWAITS UP TO 24 NOMINATIM LOOKUPS ONE AFTER ANOTHER, and it runs
           immediately before the answer is drawn — so for as long as it took, the reader saw
           「Searching」 with a finished answer already in hand. The lookups are in a file on purpose
           (one host, and its usage policy asks for exactly that), which makes a budget for the PASS
           the right shape rather than a shorter clock on each one: whatever is still unresolved when
           it runs out keeps the verdict this audit already has for it. */
        const pin0=Date.now();
        for(const it of struct.concat(textCands)){
          if(alreadyMapped(it)){ spots.push({name:it.name,verdict:'mapped',src:it.src}); continue; }   /* already on the map from the plan — counts as mapped, not re-pinned */
          if(newPins.length>=14){ spots.push({name:it.name,verdict:'unplaced',reason:'budget',src:it.src}); continue; }   /* (#R545) the 14-pin cap is OUR limit, not a fact about this place */
          if((Date.now()-pin0)>=PINPASS_BUDGET_MS){ spots.push({name:it.name,verdict:'unplaced',reason:'budget',src:it.src}); continue; }   /* (#R545) …and so is the deadline */
          let g=null, ambiguous=false, infra=false;
          /* ⚠⚠⚠ (#R397) A COORDINATE THAT ARRIVED IS NOT RE-RESOLVED: a second lookup can only agree
             (wasted) or DISAGREE, and when it disagreed the correct position lost. ⚠ A centroid does
             not qualify — `pointLike` excludes it, so an area is still reported as an area. */
          /* ⚠⚠⚠ (#R536) EVERY RUNG ASKS «DID THE RUNG ABOVE ANSWER», NEVER «DOES THE RUNG ABOVE EXIST».
             #R489 inserted the ledger as `else if(ledger)`, and `ledger` is an object js/atlas-console.js
             ALWAYS passes — so that arm was taken for every place without a coordinate, and when the ledger
             did not hold the name (the normal case: it only holds what an earlier turn already resolved) the
             chain ENDED there with g still null. `geocode` and `_atlGeocodeStrict` below it were unreachable
             in the running app. Measured on this module: six 京阪神 prefectures and cities produced ZERO
             lookups and six 「未配置」, while the same call with `ledger:null` made six. That is why every
             node check stayed green — they exercised the shape the app never runs. A rung that cannot answer
             must not be able to end the ladder, so each one asks `!g` and the ladder ends only at the bottom. */
          if(GEOBJ.pointLike(it)) g={lng:it.lng,lat:it.lat,name:it.name};
          if(!g&&ledger){ try{ const k=ledger.resolve(it.name,{kind:it.kind,countryName:it.country}); if(k&&k.lng!=null) g={lng:k.lng,lat:k.lat,name:k.canonicalName||k.name}; }catch(_){} }   /* (#R489) a place THIS conversation already resolved is not sent to a geocoder again. ⚠ (#R545) THE HINT IS BUILT FROM WHAT THIS MAPPER HOLDS — it used to pass `countryCode: it.countryCode`, and the mapper above copies no country code at all, so the narrowing was undefined at every call and 「モスクワ」 could come back as whichever one was recorded last */
          /* (#R802) the app's own country store, in all nine languages, before any request goes out. ⚠ It
             carries WHAT IT IS: a country's LABEL point represents an area, so the ledger is told
             `resolved_place_centroid` — the word this app already has for that, and deliberately not one
             of the point-like classes, so a later turn cannot mistake it for a spot someone chose. */
          if(!g){ const c=_atlCountryPoint(it.name); if(c) g={lng:c.lng,lat:c.lat,name:c.name,prov:'resolved_place_centroid'}; }
          /* ⚠ (#R802) A COUNTRY DOES NOT NARROW ITSELF. The model fills `country` with the country's own
             name when the place IS that country, and the geocoder is asked for 「X, X」 — measured live:
             'ブルンジ' → 1 hit, 'ブルンジ, ブルンジ' → 0. Zero hits is reported as `not_found`, i.e. as a fact
             about the place. This matters even with the rung above it, because `countryStats` is filled
             asynchronously and an answer can be audited before it has landed. */
          const _narrow=(it.country&&_atlNorm(it.country)!==_atlNorm(it.name))?it.country:'';
          if(!g&&it.src==='structured'){ try{ const r=await geocode([it.name,_narrow].filter(Boolean).join(', ')); if(r&&isFinite(+r.lng)&&_atlNameOk(it.name,r.name)) g={lng:+r.lng,lat:+r.lat,name:r.name}; }catch(_){ infraFail++; infra=true; } }
          if(!g){ const s=await _atlGeocodeStrict(it.name,it.src==='structured'?_narrow:''); if(s.ok) g={lng:s.lng,lat:s.lat,name:s.name}; else if(s.ambiguous) ambiguous=true; else if(s.reason==='network'){ infraFail++; infra=true; } }
          if(ambiguous){ spots.push({name:it.name,verdict:'ambiguous',src:it.src}); continue; }
          if(g){ const cell=Math.round(g.lng*20)+','+Math.round(g.lat*20); if(seenCell.has(cell)){ spots.push({name:it.name,verdict:'mapped',src:it.src}); continue; } seenCell.add(cell);
            newPins.push({lng:g.lng,lat:g.lat,name:String(it.name).slice(0,90),kind:String(it.kind||'').slice(0,60),sum:String(it.summary||'')}); if(ledger){ try{ ledger.record({kind:String(it.kind||''),name:String(it.name||''),canonicalName:g.name||String(it.name||''),countryName:String(it.country||''),lng:g.lng,lat:g.lat,summary:String(it.summary||''),source:'answer',provenance:(GEOBJ.pointLike(it)?it.provenance:(g.prov||'geocoded_point'))}); }catch(_){} }   /* (#R489) …and what it DID resolve is filed, so the next turn is handed an identifier instead of a string */ spots.push({name:it.name,verdict:'mapped',src:it.src}); }
          else spots.push({name:it.name,verdict:'unplaced',reason:(infra?'infra':'not_found'),src:it.src}); }
        if(newPins.length){ const merged=pre.concat(newPins.map(p=>({lng:p.lng,lat:p.lat,name:p.name,kind:p.kind,sum:p.sum,url:'',src:''})));
          try{ setPois(merged); let ok=paintPois(); for(let i=0;i<5&&!ok;i++){ await new Promise(r=>setTimeout(r,500)); ok=paintPois(); } }catch(_){}
          if(pre.length===0){ try{ let a=180,b=90,c=-180,d=-90; newPins.forEach(p=>{a=Math.min(a,p.lng);b=Math.min(b,p.lat);c=Math.max(c,p.lng);d=Math.max(d,p.lat);}); if(isFinite(a)&&(c-a)<340){ if((c-a)<0.05&&(d-b)<0.05) GE().camera.flyTo({center:[a,b],zoom:ctx.zoom||6,duration:1000}); else GE().camera.fitBounds([[a,b],[c,d]],{padding:80,maxZoom:9,duration:1000}); } }catch(_){} } }
        return _atlMappingNoteHtml(_atlMappingVerdict(spots), _atlAuditSources(ctx.citations||[]), {infraFail, hadNew:newPins.length>0});
      }catch(e){ try{ console.warn('reply-mapping audit failed',e); }catch(_){}   /* (#R150) NEVER an empty catch — record the cause + surface an honest note */
        return '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;opacity:.85;">'+L('Could not run the map self-check for this answer.','この回答の地図セルフチェックを実行できませんでした。','Karten-Selbstprüfung nicht möglich.','Не удалось выполнить самопроверку карты.','No se pudo verificar el mapa.')+'</div>'; } };
    }

  return { _atlAuditSources, _atlChecksNoteHtml, _atlContentClass, _atlExtractPlaces, _atlGeocodeStrict, _atlMappingNoteHtml, _atlMappingVerdict, _atlNameOk, _atlNorm, _atlParseRat, _atlRegDomain, _atlShouldMap, _atlVerifyChecks, makePinReplyPlaces };
}
