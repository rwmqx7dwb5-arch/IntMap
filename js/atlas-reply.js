/* ============================================================================
 *  IntMap · Atlas — reply rendering — safe markdown, code/math, GFM tables, source cards  (#R199)
 * ----------------------------------------------------------------------------
 *  Everything that turns an Atlas answer into HTML: the duplicate-paragraph strip (#R137), the stanza
 *  reflow (#R153/#R154), the KaTeX/code/table protection pass (#R156), the typography (#R149/#R159) and the
 *  ChatGPT-style source cards with their aggregator decoding and SNS/UGC filter (#R74/#R106/#R151/#R153).
 *  It touches no map and no app state — it is pure text in, HTML out — which is why it is the easiest third
 *  of a kilo-line to take out of the kernel and the easiest to keep honest afterwards.
 *
 *  Lifted out of js/atlas-console.js's 248-line block verbatim (#R199). It is a REAL ES module:
 *  nothing registers it on window.IntMapModules and nothing depends on load order — js/atlas-console.js
 *  names it in an `import`, so the bundler resolves the binding and orders the graph.
 *
 *  Everything the block used to read from the console's closure arrives through `CTX` (and the app's
 *  live host through `HOST`), rebound below under the ORIGINAL names so the body stays byte-identical.
 *  tests/r199-checks.test.mjs re-derives that byte-identity from the two files on every commit.
 * ==========================================================================*/
import { everyTick, stopTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */
import { makeAtlasAnnotate } from './atlas-annotate.js';   /* (#R492) the in-reply unit / clock / abbreviation notes — js/atlas-annotate.js */
import { makeAtlasMarkdown } from './atlas-markdown.js';   /* (#R494) the block parser — see the header of that file */
import { makeAtlasHighlight } from './atlas-highlight.js';  /* (#R494) code-block token colouring */
export function makeAtlasReply(HOST, CTX) {
  const L=CTX.L, esc=CTX.esc, fitTo=CTX.fitTo, fmtVal=CTX.fmtVal, highlight=CTX.highlight, note=CTX.note, warn=CTX.warn;
  /* (#R492) the in-reply notes. ⚠ MADE HERE, not at module scope: a js/ module may hold no unexported
     top-level declaration (tests/r175 ③), so the lexicon and the compiled regexes live inside the factory. */
  const { annotateAtlasHTML, annotateAtlasText, annotateOptions, wireAtlasAnnotations } = makeAtlasAnnotate();
  const _atlMd=makeAtlasMarkdown({ esc });   /* (#R494) built once per reply pipeline; it holds no state between calls */
  const { highlightCode }=makeAtlasHighlight();   /* (#R494) …and one grammar cache with it */
    /* ══ (#R463) ATOMS — the two sentence tokenizers below must never cut inside a URL or a number ═══
       Reported: an Atlas answer rendered "地図中心付近の49." and "10°N・19.54°E" as two paragraphs, and its
       source link came out as a dead anchor reading "https://liptovska-mara.". Neither is a model defect
       nor a markdown defect. BOTH tokenizers in this file treat every '.' as a possible sentence end:
         _atlStanza  → SENT       cuts a >230-char run-on into ~2-sentence stanzas rejoined with '\n\n'
         _dedupText  → dedupLine  cuts a line into sentences to drop verbatim repeats (#R137)
       A dotted host (liptovska-mara.slovakian-mountains.eu) reads as three sentences and a decimal
       (21.6 / 49.10 / 19.54) as two, so a stanza boundary lands INSIDE them — and the markdown-link and
       bare-URL rules further down allow no whitespace in a URL, which is why only the fragment up to the
       first dot became a link. Measured on this branch BEFORE the fix, one 306-char paragraph produced
       "21.\n\n6平方キロメートル", "49. 10°N・19.\n\n54°E" and href="https://liptovska-mara.".
       ⚠ The dedup side was worse than a broken link. Its tokens are rejoined with '' so nothing shifts —
       it DELETES a repeated middle token instead. The same URL twice in one reply therefore rendered the
       second one as href="https://liptovska-mara.html": a different, live, wrong destination that looks
       perfectly ordinary. A visibly broken link is reported; that one would not be.
       ⚠ THE FIX IS NOT A SMARTER FULL-STOP TEST. Deciding "is this dot a sentence end" from the characters
       around it is guesswork that gets abbreviations and hosts wrong forever, one special case at a time.
       Instead the spans that are NEVER prose — a markdown link, a URL, an e-mail address, a decimal or
       thousands-separated number — are lifted OUT of the string into placeholders BEFORE either tokenizer
       sees it and put back immediately after, so the tokenizer cannot cut where a cut is meaningless.
       Nothing else moves: the >230 length gate still measures the REAL paragraph and every dedup key is
       computed on the RESTORED token, so text carrying no atom tokenizes byte-for-byte as it did before.
       Placeholders are PUA U+E010/U+E011, deliberately distinct from mdMini's own U+E000/U+E001 code /
       math / table tokens — those are already in the string by the time _atlStanza runs. */
    /* ⚠ FOUR spans, in this order, and the order is load-bearing. (1) a whole markdown link, label included.
       (2) a scheme-ful or www url — its character class is the LINKIFIER's own (/(https?:\/\/[^\s<)"']+)/,
       further down): the span held out here and the span that becomes the href must be the SAME span, or a
       cut could still land inside an anchor. (3) an e-mail address. (4) a bare host or filename — reuters.com,
       index.html — which is not a decoration: js/atlas-answer-render.js runs stripModelUrls() over structured
       answers and hands mdMini exactly that, so without this branch the commonest source citation in the app
       still rendered as "reuters." / "com" on two paragraphs. Its TLD must be LOWERCASE so that an English
       run-on typed without a space ("the end.Next one") is still read as two sentences, and its lookbehind
       stops it matching the tail of a token an earlier branch already declined. (5) a decimal or
       thousands-separated number. ⚠ An ABBREVIATION is deliberately NOT here: "U.S." and "e.g." are prose,
       the guesswork about them is exactly what this design refuses, and they split today as they always did. */
    const _ATL_ATOM=/!?\[[^\]\n]{0,200}\]\([^)\s]{1,400}\)|(?:https?:\/\/|www\.)[^\s<)"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|(?<![A-Za-z0-9@.-])[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)*\.[a-z]{2,24}(?![A-Za-z0-9])|\d+(?:[.,]\d+)+/g;
    function _atlHold(s){ const A=[]; const t=String(s==null?'':s).replace(_ATL_ATOM,m=>{ A.push(m); return '\uE010'+(A.length-1)+'\uE011'; }); return { t, A }; }
    function _atlFree(s,A){ return A.length?String(s).replace(/\uE010(\d+)\uE011/g,(m,i)=>A[+i]!==undefined?A[+i]:m):String(s); }
    /* (#R62) minimal safe markdown for AI text rendered in the chat (briefs / analyses). */
    /* (#R137) Atlas occasionally emits the SAME sentence/paragraph twice verbatim in one reply ("たまに二度同じことを
       …同じ文章をそのまま繰り返す"). Strip verbatim-duplicate paragraphs and sentences (normalized, length-gated so short
       repeats like list labels or "はい。" survive). Spacing is preserved by keeping each sentence's trailing whitespace
       and rejoining with '' — so nothing is dropped unless a long duplicate key is seen. Fully guarded → original on error. */
    function _dedupText(s){ s=String(s==null?'':s); if(!s||s.length<24) return s;
      try{
        const MIN=15; const norm=x=>String(x).trim().replace(/\s+/g,' ').toLowerCase();
        const seenSent=new Set();
        const dedupLine=(line)=>{ const H=_atlHold(line);                                    /* (#R463) a dotted host / a decimal is not a sentence end */
          const toks=H.t.match(/[^.!?。！？]*[.!?。！？]+\s*|[^.!?。！？]+$/g); if(!toks) return line;
          const out=[]; for(const tk0 of toks){ const tk=_atlFree(tk0,H.A); const k=norm(tk);   /* the KEY is the restored token → atom-free text dedups exactly as before */
            if(k.length>=MIN){ if(seenSent.has(k)) continue; seenSent.add(k); } out.push(tk); }
          return out.join(''); };
        const seenPara=new Set(); const outP=[];
        for(const p of s.split(/\n{2,}/)){
          const pp=p.split('\n').map(dedupLine).filter(l=>l!=='').join('\n');
          if(!pp.trim()) continue;
          const pk=norm(pp); if(pk.length>=MIN){ if(seenPara.has(pk)) continue; seenPara.add(pk); }
          outP.push(pp);
        }
        const res=outP.join('\n\n'); return res||s;
      }catch(_){ return s; }
    }
    /* (#R117) heading HIERARCHY inside Atlas replies ("見出しは大きくするなど" — the reply's own text sizes now vary
       by role: h1 > h2 > h3 ≥ body; the chat body & user-message sizes are untouched). */
    /* (#R147) Typography: headings/lists use EM units (not fixed px) so the hierarchy scales with the bubble
       font-size in BOTH normal (12.8px) and sidebar (15px) modes — and, being em, they escape the sidebar rule
       that force-lifts literal 12–13px spans to 15px, which used to FLATTEN the headings. Paragraph breaks (\n\n)
       now insert real vertical space, so replies read as titled, spaced sections instead of one monotone block. */
    /* (#R150) CODE-SIDE typographic rhythm — the user keeps reporting Atlas replies read as a monotonous wall of
       same-size text with no spacing between groups, even after R147–R149 strengthened the prompt + heading em
       sizes. The gap: those only help when the MODEL emits ## headings / blank lines. When it returns flat prose
       they do nothing. So we structure it in code: (a) _atlStanza groups a long single-block run-on into ~2-sentence
       stanzas (content-preserving, sentence-aware, EN + CJK); (b) a single newline after a sentence end becomes a
       soft paragraph gap. Structured replies (headings/bullets/blank-line paragraphs) are left exactly as the model
       wrote them. Pure/deterministic → unit-tested via IntMapAtlasDebug.mdMini / _atlStanza. */
    /* (#R153) DETERMINISTIC structure synthesis — the persistent "同一サイズのテキストが単調に並ぶ／まだほぼ単調" complaint.
       R150–R152 only promoted a lead when the whole reply was ONE run-on block: the ">1 newline" guard bailed on the
       COMMON case (multi-paragraph flat prose), so most replies stayed monotone. This restructures ANY unstructured
       reply into titled, spaced sections — honestly, using only text the MODEL actually wrote:
         • a model-written "Label:" / "背景：" section lead (paragraph- OR sentence-initial) → a real ## heading (size),
         • the opening sentence of the reply                          → a bold lead line,
         • every section/paragraph                                    → separated by a blank line (mdMini → 余白),
         • a long run of sentences                                    → split into ~2-sentence stanzas,
         • numbered / dashed lines                                    → normalised to bullets.
       Replies the model ALREADY structured with ## headings are returned untouched. CJK is weighted (dense) so short
       Japanese replies still restructure. Labels are capped at a short prefix so mid-sentence colons never misfire.
       Pure/deterministic → unit-tested via IntMapAtlasDebug. */
    /* (#R154) NO MORE HEADING FABRICATION. R150–R153 promoted a reply's opening sentence to a big bold lead AND turned any
       sentence-initial "Label:" into a "## " heading — that guesswork is exactly the "テキストを大きくする箇所がおかしい／
       判定がおかしい" the user reported (a plain first sentence blown up, a mid-thought colon becoming a heading). Enlargement
       now happens ONLY for structure the MODEL actually authored (its own "## " / a whole-line "**bold**"), rendered by mdMini
       with SIZE + SPACING and NO colour. This function only does SAFE, non-enlarging reflow so prose still breathes:
       split an over-long run-on paragraph into ~2-sentence stanzas, normalise numbered/dashed lines to bullets, and keep a
       blank line between paragraphs ("配置・余白"). It never invents a heading. */
    function _atlStanza(raw){ raw=String(raw||'');
      if(/^\s*#{1,6}\s/m.test(raw)) return raw;                               /* model emitted real headings already → respect verbatim */
      const plainAll=raw.replace(/\s+/g,' ').trim();
      const cjk=(plainAll.match(/[぀-ヿ㐀-鿿가-힯]/g)||[]).length;               /* CJK carries ~2× the text of a Latin char */
      /* ⚠⚠ (#R494) THE LINES ARE NO LONGER TRIMMED, AND THAT IS THE WHOLE FIX FOR NESTED LISTS.
         `.map(s=>s.trim())` removed the leading whitespace from every line before anything looked at
         it, so a sub-item («  - …») and its parent arrived at the renderer at the same indent and
         there was nothing left to nest. Only the NON-list paragraphs are trimmed now (their indent
         carries no meaning); a list line keeps its column. */
      const paras=raw.split(/\n\s*\n|\n/).filter(s=>s.trim());
      if(!paras.length) return raw;
      if((plainAll.length+cjk)<=150 && paras.length<2) return raw;            /* a one-line answer doesn't need reflow */
      const isList=p=>/^[ \t　]*(?:[-・*•+][ \t　]|\d{1,9}[.)、][ \t　]|[①-⑳])/.test(p);
      const SENT=/[^.!?。！？…]+(?:[.!?。！？…]+["”』）)]*|$)/g;
      const out=[];   /* {text, list} — a run of consecutive list lines is rejoined with ONE newline so it stays one list */
      for(const p0 of paras){
        const pl=p0.replace(/[ \t　]+$/,'');
        /* ⚠ (#R494) A NUMBER IS NOT A BULLET. #R154 normalised «1.» and «①» to «- », which is why an
           ordered list arrived at the reader unnumbered. The marker is CANONICALISED now, not
           replaced: 「1、」→「1. 」 keeps the number, ①-⑳ keep their value, and only the genuinely
           interchangeable bullet glyphs (•・*+) fold to «- ». Full-width indent becomes spaces so the
           column arithmetic in js/atlas-markdown.js can count it. */
        if(isList(pl)){ out.push({ text:pl
            .replace(/^([ \t　]*)(\d{1,9})[.)、][ \t　]+/,(m,ind,n)=>ind.replace(/　/g,'  ')+n+'. ')
            .replace(/^([ \t　]*)([①-⑳])[ \t　]*/,(m,ind,c)=>ind.replace(/　/g,'  ')+c+' ')
            .replace(/^([ \t　]*)[•・*+][ \t　]+/,(m,ind)=>ind.replace(/　/g,'  ')+'- '), list:true }); continue; }
        const p=pl.trim();
        const pc=(p.match(/[぀-ヿ㐀-鿿가-힯]/g)||[]).length;
        if((p.length+pc)>230){ const H=_atlHold(p);                            /* (#R463) the gate still measures the REAL paragraph; only the SPLIT sees placeholders */
          const sents=(H.t.match(SENT)||[H.t]).map(x=>_atlFree(x,H.A));        /* long run-on → ~2-sentence stanzas (spacing only, no enlargement) */
          if(sents.length>=3){ for(let i=0;i<sents.length;i+=2) out.push({ text:sents.slice(i,i+2).join(' ').trim(), list:false }); continue; } }
        out.push({ text:p, list:false });
      }
      let joined='';
      for(let i=0;i<out.length;i++){ if(i) joined += (out[i].list && out[i-1].list) ? '\n' : '\n\n'; joined += out[i].text; }
      return joined; }
    /* (#R156) ================= UNIFIED MARKDOWN + LaTeX RENDERER =================
       The long-standing "Atlas replies are a monotone wall of text" complaint AND the vision/math work order both
       demand a REAL renderer, not more regexes bolted onto esc(). mdMini is now a wrapper that ADDS, on top of the
       existing R154/R155 heading/bold/bullet/paragraph typography (kept verbatim below):
         • fenced ``` code blocks  → language label + Copy button, HTML-escaped (never executed)
         • $$…$$ / \[…\] display + $…$ / \(…\) inline math → KaTeX (ChatGPT-quality: matrices, fractions, subs/sups)
         • GFM pipe tables          → real <table> inside a horizontally-scrollable wrapper (mobile-safe)
         • `inline code`, *italic*, > blockquotes
       SAFETY: every author text run is still esc()'d; the ONLY HTML injected is (a) our own generated tags and (b)
       KaTeX output (fixed trusted lib, output:'html', trust:false). Code/math/tables are pulled into PLACEHOLDER
       tokens (PUA … — untouched by esc) BEFORE the markdown pass and restored AFTER, so a `$` or `<`
       inside code/math is never mis-parsed and math is never HTML-escaped into garbage.
       ROBUSTNESS: broken LaTeX (throwOnError:false) and a KaTeX-not-loaded/CDN-down state both DEGRADE to the escaped
       raw source (data-tex kept so _atlTypesetMath upgrades it if KaTeX arrives late) — one bad formula never breaks
       the whole reply. Pure/deterministic → unit-tested via IntMapAtlasDebug.mdMini. */
    let _atlCbSeq=0;
    function _atlKatex(tex, display){ tex=String(tex==null?'':tex).trim();
      if(window.katex && typeof window.katex.renderToString==='function'){ try{
        const h=window.katex.renderToString(tex,{displayMode:!!display,throwOnError:false,strict:false,output:'html',trust:false});
        return display?('<div class="atl-math-b">'+h+'</div>'):h;
      }catch(_){} }
      const attr=' data-tex="'+esc(tex)+'" data-display="'+(display?'1':'0')+'"';   /* fallback carries the source → upgradeable if KaTeX loads late / returns */
      return display?('<div class="atl-math-b atl-math-raw"'+attr+'><code>'+esc(tex)+'</code></div>')
                    :('<code class="atl-math-raw"'+attr+'>'+esc(tex)+'</code>'); }
    function _atlTypesetMath(root){ try{ if(!(window.katex&&window.katex.renderToString)) return;
      (root||document).querySelectorAll('.atl-math-raw[data-tex]').forEach(el=>{ try{ const tex=el.getAttribute('data-tex')||''; const disp=el.getAttribute('data-display')==='1';
        const h=window.katex.renderToString(tex,{displayMode:disp,throwOnError:false,strict:false,output:'html',trust:false});
        if(disp){ el.classList.remove('atl-math-raw'); el.removeAttribute('data-tex'); el.innerHTML=h; }
        else { const s=document.createElement('span'); s.innerHTML=h; el.replaceWith(s.firstChild||s); } }catch(_){} }); }catch(_){} }
    try{ window._atlTypesetMath=_atlTypesetMath; }catch(_){}
    /* ⚠ (#R494) `highlightCode` REPLACES the `esc(code)` that used to sit here, and inherits its whole
       job: it escapes every character of the source itself and emits nothing but its own <span>s.
       An unlabelled fence gets no grammar and comes back plainly escaped, exactly as before.
       The Wrap button is the reader's override for the default `white-space:pre`; the Copy button
       still copies `code.textContent`, which is the source text with the spans stripped by the DOM. */
    /* (#R494) a fence written INSIDE a list item is indented to the item's content column, and the
       protection pass captures that indent as part of the code. Strip the common prefix so the block
       reads as the author wrote it rather than shifted right by the markup around it. */
    function _atlDedentCode(code){ const ls=String(code).split('\n');
      let min=Infinity; for(const l of ls){ if(!l.trim()) continue; const m=/^[ \t]*/.exec(l)[0];
        let w=0; for(const c of m) w+=(c==='\t'?4:1); if(w<min) min=w; }
      if(!min||min===Infinity) return code;
      return ls.map(l=>{ let i=0,w=0; while(i<l.length&&w<min){ const c=l.charAt(i); if(c===' '){w++;i++;} else if(c==='\t'){w+=4;i++;} else break; } return l.slice(i); }).join('\n'); }
    function _atlCodeBlock(code, lang){ code=_atlDedentCode(String(code).replace(/\n+$/,'')); const id='atlcb'+(_atlCbSeq++);
      const lbl=lang?esc(String(lang).slice(0,24)):'';
      return '<div class="atl-codewrap"><div class="atl-codebar"><span class="atl-codelang">'+(lbl||'code')+'</span>'
        +'<span class="atl-codebtns">'
        +'<button class="atl-codewrapbtn" type="button" data-cid="'+id+'">'+esc(L('Wrap','折り返し','Umbrechen','Перенос','Ajustar'))+'</button>'
        +'<button class="atl-codecopy" type="button" data-cid="'+id+'">'+esc(L('Copy','コピー','Kopieren','Копировать','Copiar'))+'</button></span></div>'
        +'<pre class="atl-codeblock"><code id="'+id+'">'+highlightCode(code,lang)+'</code></pre></div>'; }
    /* ⚠ (#R492) ONE options object per reply. `seen` inside it is what makes an abbreviation carry its
       note on FIRST USE only; sharing it across replies would annotate a term once and never again, and
       making a new one per paragraph would underline the same word five times in one answer. */
    function _atlAnnOpts(){ try{ return annotateOptions({ lang:(HOST&&HOST.lang)||'en', tz:(HOST&&HOST.userTZ)||null }); }catch(_){ try{ return annotateOptions({}); }catch(__){ return null; } } }
    /* (#R159) table cells: strip **bold** markers to plain — Atlas replies carry no bold (inline code/math placeholders survive esc + restore globally).
       (#R492) …and a cell is prose too: it is annotated here rather than by the pass at the end of mdMini, because by then
       the whole table is a single placeholder token and its cells are out of that walk's reach. */
    function _atlCellFmt(s,AN){ const t=esc(String(s==null?'':s)).replace(/\*\*([^*]+)\*\*/g,'$1'); if(!AN) return t; try{ return annotateAtlasText(t,AN); }catch(_){ return t; } }
    /* ⚠ (#R494) A CELL MAY CONTAIN A PIPE. The splitter was `split(/\|/)`, so `\|` — the escape GFM
       defines for exactly this — cut the row at the character it was written to protect, silently
       shifting every later cell one column left. Split on a pipe that is NOT preceded by a
       backslash, then unescape. */
    const _atlCutRow=r=>String(r).trim().replace(/^\|/,'').replace(/\|$/,'')
      .split(/(?<!\\)\|/).map(x=>x.trim().replace(/\\\|/g,'|'));
    /* ⚠ (#R494) `white-space:nowrap` ON EVERY CELL IS RIGHT FOR NUMBERS AND WRONG FOR SENTENCES.
       It is what keeps a comparison table's figures on one line, and it is also what made a table
       with one prose column scroll several screens sideways. The decision is now PER COLUMN and is
       made from the content: a column stays nowrap while every one of its cells is short or looks
       like a measurement; the moment one cell is a sentence, that column wraps and the rest of the
       table keeps its alignment. */
    function _atlColWrap(cells){
      let longest=0, prose=false;
      for(const c of cells){ const t=String(c==null?'':c).trim();
        if(t.length>longest) longest=t.length;
        if(!/^[\s\d.,:;%+\-–—/()°$¥€£~×xX*a-zA-Z]{0,14}$/.test(t)) prose=true; }
      return longest>14 || (prose && longest>10); }
    function _atlBuildTable(header, sep, body, AN){
      const cut=_atlCutRow;
      const aligns=cut(sep).map(s=>{ const l=/^:/.test(s), r=/:$/.test(s); return (r&&l)?'center':r?'right':l?'left':''; });
      const th=cut(header); const rows=body.map(cut);
      const wrap=th.map((c,i)=>_atlColWrap([c].concat(rows.map(r=>r[i]))));
      const at=i=>(wrap[i]?' class="atl-c-wrap"':'')+(aligns[i]?(' style="text-align:'+aligns[i]+'"'):'');
      let h='<div class="atl-tablewrap"><table class="atl-md-table"><thead><tr>';
      th.forEach((c,i)=>{ h+='<th'+at(i)+'>'+_atlCellFmt(c,AN)+'</th>'; }); h+='</tr></thead><tbody>';
      rows.forEach(r=>{ h+='<tr>'; for(let i=0;i<th.length;i++){ h+='<td'+at(i)+'>'+_atlCellFmt(r[i],AN)+'</td>'; } h+='</tr>'; });
      return h+'</tbody></table></div>'; }
    function mdMini(s){ s=String(s||''); const B=[], I=[]; const AN=_atlAnnOpts();
      const pB=h=>{ B.push(h); return 'B'+(B.length-1)+''; };
      const pI=h=>{ I.push(h); return 'I'+(I.length-1)+''; };
      /* 1) protect fenced code, then display + inline math, then inline code (block-level first; guarded $…$ last) */
      s=s.replace(/```([\w+#.\-]*)[ \t]*\r?\n?([\s\S]*?)```/g,(m,lang,code)=>pB(_atlCodeBlock(code,lang)));
      s=s.replace(/\$\$([\s\S]+?)\$\$/g,(m,t)=>pB(_atlKatex(t,true)));
      s=s.replace(/\\\[([\s\S]+?)\\\]/g,(m,t)=>pB(_atlKatex(t,true)));
      s=s.replace(/`([^`\n]+)`/g,(m,c)=>pI('<code class="atl-code-i">'+esc(c)+'</code>'));
      s=s.replace(/\\\(([\s\S]+?)\\\)/g,(m,t)=>pI(_atlKatex(t,false)));
      s=s.replace(/(^|[^\\$\w])\$(?!\s)([^\n$]*?[^\s$])\$(?![\w$])/g,(m,pre,t)=>pre+pI(_atlKatex(t,false)));   /* inline $…$ — guarded so "$5"/"a$b" currency & code don't misfire */
      /* 2) GFM pipe tables → protected block */
      s=(function(src){ const ls=src.split('\n'), out=[]; let i=0;
        const isRow=l=>/^\s*\|.*\|\s*$/.test(l), isSep=l=>/\|/.test(l)&&/-/.test(l)&&/^\s*\|?[\s:|-]*-[-\s:|]*\|?\s*$/.test(l);
        while(i<ls.length){ if(isRow(ls[i])&&i+1<ls.length&&isSep(ls[i+1])){ const hdr=ls[i], sp=ls[i+1], bd=[]; let j=i+2; while(j<ls.length&&isRow(ls[j])){ bd.push(ls[j]); j++; } out.push(pB(_atlBuildTable(hdr,sp,bd,AN))); i=j; } else { out.push(ls[i]); i++; } }
        return out.join('\n'); })(s);
      /* ══ ⚠⚠⚠ (#R494) 3) THE BLOCK STRUCTURE — PARSED, NOT PATTERN-MATCHED ══════════════════════
         What stood here from #R149 to #R232 was `esc(text)` followed by twelve `.replace()` calls
         that rewrote line shapes into <div>s and turned newlines into SPACER ELEMENTS — an empty
         1.5em div for a blank line, a 0.82em one for a sentence-end newline, <br> for the rest —
         and then a POST-PASS that went back over the finished HTML to delete the spacer beside a
         heading, because the heading rule and the paragraph rule each emitted air and 2.05em +
         1.5em is 3.55em of nothing above a `## ` section. A renderer that has to re-read its own
         output to correct it is telling you it never knew what it was building.

         It is a parser now (js/atlas-markdown.js): lines → a block tree → semantic HTML, and the
         spacing is CSS. The double gap is not fixed, it is ABSENT — <p>'s bottom margin and <h2>'s
         top margin COLLAPSE, which is the browser doing for free the arithmetic #R232 did by hand.
         ⚠ THE DECISIONS THE OLD CHAIN CARRIED ARE UNCHANGED AND ARE NOW STATED ONCE, IN CSS:
         #R154 headings differentiate by SIZE + SPACING and carry no colour, #R159 they are weight
         600 and the reply body has no bold, #R150 a sentence-end + single newline is a soft gap.
         What is NEW is what the chain could not express at all: nested lists, real ordered lists,
         a list item that contains a second paragraph or a code block, a multi-line blockquote as
         ONE quote, a horizontal rule, and escaped markdown. */
      let html=_atlMd.renderMarkdown(_dedupText(_atlStanza(s)));
      /* ⚠ (#R492) THE ANNOTATION PASS STANDS HERE, AND NOWHERE ELSE. Above it the reply is finished HTML;
         below it the code/math/table placeholders come back. Running here means the walk never sees the inside
         of a code block, a formula or an inline `code` span — those are still single PUA tokens — and it never
         sees an attribute, because annotateAtlasHTML splits tags from text. Running it in js/atlas-console.js
         AFTER the bubble is painted would have been wrong for a different reason: _atlCompose rebuilds that
         bubble's innerHTML from the stored HTML strings once per tool call, so DOM-side decoration is erased
         by the next action. Table cells are annotated by _atlCellFmt with the SAME options object.
         ⚠ (#R494) …and it now walks SEMANTIC elements rather than a chain of styled <div>s. Nothing about
         where it stands changes: it still sees finished HTML with code, maths and tables held out of it. */
      if(AN){ try{ html=annotateAtlasHTML(html,AN); }catch(_){} }
      /* 4) restore protected blocks (may hold inline placeholders) THEN inlines */
      return html.replace(/B(\d+)/g,(m,i)=>B[+i]||'').replace(/I(\d+)/g,(m,i)=>I[+i]||''); }
    /* (#R156) ONE-TIME wiring for the renderer's interactive bits, at document level so it works in EVERY Atlas
       surface (floating panel, sidebar tab, workspace window): (a) a Copy button on each code block copies the raw
       code + flips its label for ~1.4s; (b) if KaTeX finishes loading AFTER a reply was painted (slow CDN — rare,
       since it is a defer script that runs before DOMContentLoaded), upgrade the escaped-raw fallbacks in place. */
    function _atlFallbackCopy(txt){ try{ const ta=document.createElement('textarea'); ta.value=String(txt||''); ta.style.cssText='position:fixed;left:-9999px;top:0;'; document.body.appendChild(ta); ta.focus(); ta.select(); try{ document.execCommand('copy'); }catch(_){} ta.remove(); }catch(_){} }
    try{ if(!window.__atlRenderWired){ window.__atlRenderWired=true;
      try{ wireAtlasAnnotations(); }catch(_){}   /* (#R492) hover / tap on an annotation — document-level, so all three Atlas surfaces get it */
      document.addEventListener('click',e=>{ try{ const b=e.target.closest&&e.target.closest('.atl-codecopy'); if(!b) return;
        const code=document.getElementById(b.getAttribute('data-cid')); const txt=code?(code.textContent||''):'';
        const done=()=>{ const old=b.textContent; b.textContent=L('Copied','コピー済み','Kopiert','Скопировано','Copiado'); b.classList.add('ok'); setTimeout(()=>{ try{ b.textContent=old; b.classList.remove('ok'); }catch(_){} },1400); };
        try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(()=>{ _atlFallbackCopy(txt); done(); }); } else { _atlFallbackCopy(txt); done(); } }catch(_){ _atlFallbackCopy(txt); done(); }
      }catch(_){} });
      /* (#R494) the Wrap toggle. Document-level and per-block, like Copy — a reader who turns wrapping
         on for one JSON payload has not asked for it on the next reply's shell transcript. The state
         lives on the <pre> element, so it survives nothing and needs to survive nothing. */
      document.addEventListener('click',e=>{ try{ const b=e.target.closest&&e.target.closest('.atl-codewrapbtn'); if(!b) return;
        const code=document.getElementById(b.getAttribute('data-cid')); const pre=code&&code.closest?code.closest('.atl-codeblock'):null; if(!pre) return;
        const on=pre.classList.toggle('wrap'); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false');
      }catch(_){} });
      /* (#R494) …and the source row's overflow chip: reveal the cards the six-card row could not hold */
      document.addEventListener('click',e=>{ try{ const b=e.target.closest&&e.target.closest('.atl-lc-more'); if(!b) return;
        const rest=b.parentNode&&b.parentNode.querySelector?b.parentNode.querySelector('.atl-lc-rest'):null;
        if(rest) rest.hidden=false; b.remove();
      }catch(_){} });
      /* belt-and-suspenders: re-typeset any raw-LaTeX fallbacks once KaTeX is present (covers a slow-CDN edge) */
      /* (#R224) …and KaTeX is fetched HERE, the first time an answer carries maths, rather than at
         boot: 258 kB + its stylesheet on every session for a feature most sessions never reach (see
         src/vendor.js). The retry loop below is unchanged and still covers a slow arrival. */
      try{ if(!(window.katex&&window.katex.renderToString)&&window.IntMapVendor
            &&document.querySelector('.atl-math-raw[data-tex]')) window.IntMapVendor.katex().catch(()=>{}); }catch(_){}
      /* ⚠ (#R408) ONE key for every reply that is waiting: the wait is for a GLOBAL (window.katex) and the action is
         document-wide and idempotent, so a second answer's wait SUPERSEDING the first is exactly right — per-reply keys
         would leave N timers polling one global and typesetting the same document N times. */
      try{ if(window.katex&&window.katex.renderToString){ _atlTypesetMath(document); } else { let _k=0; const _t=everyTick('atlas-reply:katex-wait',500,()=>{ if((window.katex&&window.katex.renderToString)){ stopTick(_t); _atlTypesetMath(document); } else if(++_k>20){ stopTick(_t); } }); } }catch(_){}
    } }catch(_){}
    /* (#R74) ChatGPT-style SOURCE LINK CARDS ("Atlasの返答に、必要であれば記事のリンク等をChatGPT風UIで表示"):
       compact rounded cards with the site's favicon, the article title and its domain — used by analyze,
       mapReport and any reply that carries real article URLs. Only http(s) URLs that came from evidence or
       search results are ever passed in; nothing here is fabricated client-side. */
    /* (#R106) Google News RSS links are aggregator REDIRECTS (news.google.com/rss/articles/CBMi…), not the real
       article — this was the "情報源の一般的なリンク" the user saw (every card read "news.google.com"). The token after
       /articles/ usually embeds the publisher URL; decode it (base64 → find the http URL) so the card links to and
       shows the ACTUAL article. Returns null when the token is the newer opaque form (then we label by publisher). */
    function _isAggUrl(u){ try{ return /(^|\.)news\.google\.com$/i.test(new URL(u).hostname); }catch(_){ return false; } }
    function _decGNewsUrl(u){ try{ const m=String(u||'').match(/news\.google\.com\/(?:rss\/)?articles\/([A-Za-z0-9_\-]{16,})/i); if(!m) return null;
      let b=m[1].replace(/-/g,'+').replace(/_/g,'/'); while(b.length%4) b+='='; let bin=''; try{ bin=atob(b); }catch(_){ return null; }
      const um=bin.match(/https?:\/\/[A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%-]{6,}/); if(!um) return null;
      let real=um[0].replace(/[\x00-\x1f].*$/,''); try{ const h=new URL(real).hostname; if(!h||/news\.google\.com/i.test(h)||h.indexOf('.')<0) return null; }catch(_){ return null; }
      return real; }catch(_){ return null; } }
    /* (#R151) SOURCE RELIABILITY — the user reported Atlas citing "まったく関係ないリンクや、SNSのリンク" (unrelated / social
       links). Social & UGC platforms, URL shorteners and video hosts are NOT reliable primary sources for factual claims,
       so DROP them from the source cards (kept end-to-end for every reply that shows sources). Reputable news, official
       (.gov/.mil/.int/.edu/.go.jp…) and encyclopedic domains pass through unchanged. */
    const _SNS_RE=/(^|\.)(twitter\.com|x\.com|t\.co|facebook\.com|fb\.com|fb\.watch|m\.facebook\.com|instagram\.com|threads\.net|tiktok\.com|reddit\.com|redd\.it|pinterest\.[a-z.]+|tumblr\.com|mastodon\.[a-z.]+|bsky\.app|weibo\.com|vk\.com|ok\.ru|linkedin\.com|lnkd\.in|quora\.com|snapchat\.com|discord\.(?:com|gg)|t\.me|telegram\.me|youtube\.com|youtu\.be|m\.youtube\.com|bit\.ly|tinyurl\.com|goo\.gl|ift\.tt|buff\.ly|dlvr\.it|ow\.ly|truthsocial\.com|gettr\.com|gab\.com|mixi\.jp|line\.me|ameblo\.jp|hatenablog\.(?:com|jp)|hateblo\.jp|blogspot\.[a-z.]+|livejournal\.com|note\.com|fc2\.com|seesaa\.net|5ch\.net|2ch\.sc|4chan\.org|4channel\.org|nicovideo\.jp|nico\.ms|vimeo\.com|dailymotion\.com|rumble\.com|is\.gd|cutt\.ly|rb\.gy|rebrand\.ly|shorturl\.at|amzn\.to|j\.mp)$/i;   /* (#R152) broadened: + blog platforms / forums / more video & shorteners / more SNS — still NOT medium/substack (those can be legitimate primary journalism) */
    function _atlBadSourceHost(h){ try{ return _SNS_RE.test(String(h||'').toLowerCase().replace(/^www\./,'')); }catch(_){ return false; } }
    /* (#R152) RELEVANCE gate for source cards ("まったく関係ないリンクを張る" — Atlas attached gathered-but-unrelated articles):
       tokenise the reply text and a card's title/url; keep a card only if it shares ≥1 meaningful token (Latin words ≥4
       chars OR CJK bigrams, minus stop-words). Conservative — if the reply is too short to judge, keep everything, and
       WEB-VERIFIED / model-CITED sources bypass this entirely (they are anchored to a claim). Applies to the merely
       "gathered" buckets that were surfacing off-topic links. */
    const _ATL_RELV_STOP=new Set(['this','that','with','from','have','were','been','their','which','about','there','these','those','other','more','most','also','into','over','than','then','they','will','would','could','should','after','before','while','because','between','among','such','some','many','much','said','says','report','reported','according','news','article','latest','update','world','country','region']);
    function _atlTokens(s){ s=String(s||'').toLowerCase(); const out=new Set();
      (s.match(/[a-z0-9À-ɏ]{4,}/g)||[]).forEach(w=>{ if(!_ATL_RELV_STOP.has(w)) out.add(w); });
      (s.match(/[぀-ヿ㐀-鿿가-힯]{2,}/g)||[]).forEach(run=>{ for(let i=0;i<run.length-1;i++) out.add(run.slice(i,i+2)); });
      return out; }
    /* ══ ⚠⚠ (#R232) 「AtlasのSourcesにまったく関係のない記事を貼るな」 ══════════════════════════════
       「岡山県でAI researchしたのに、まったく関係ない記事が添付されていた」 — and the screenshot names
       the two ways the #R152/#R153 gate below let them through. Both are the same mistake: the gate
       judged a card against THE WHOLE REPLY, and never against WHAT WAS ASKED ABOUT.

         ① ONE shared token was enough. `_atlTokens` emits CJK BIGRAMS, so a brief on 岡山県 — which is
            in 中国地方 and will say so — shares 「中国」 with a headline about 韓国で元中国人民解放軍…,
            and that headline was then "relevant". A two-character coincidence is not a topic.
         ② The cross-script rule returned TRUE, unconditionally. It was meant as "we cannot judge, so
            do not wrongly drop"; in practice an English reply plus a Japanese headline (エル・キャピタン
            を3時間足らずで登…) skipped the test entirely and was always kept.
         ③ …and `kept.length?kept:cards` meant that when NOTHING matched, EVERYTHING was shown.

       ⚠ THE FIX IS TO ASK THE RIGHT QUESTION: is this card about the TOPIC? `topic` is the place or
       subject the articles were fetched for, so the primary test is now a substring match on its
       distinctive keys (with the administrative suffix trimmed, so 岡山県 also matches 岡山, and
       generic words like "prefecture" never become the key). The reply-text overlap survives only as
       a CROSS-SCRIPT fallback — for the case the old rule was written for — and there it needs TWO
       independent tokens, which is what kills the 「中国」 coincidence.
       ⚠ AND AN EMPTY SECTION IS NOW AN ALLOWED ANSWER. #R153's fallback existed so that real sources
       are never hidden by an only-SNS coincidence, and host-cleaning already runs first (see
       linkCards) — but "no article we gathered is about this" is a true statement, and printing six
       unrelated ones instead is the defect being reported. */
    const _ATL_GENERIC_GEO=new Set(['prefecture','province','city','town','village','region','state','county','district','republic','island','islands','area','areas','metropolitan','municipality','oblast','krai','governorate','department','canton','commune','borough','ward']);
    function _atlTopicKeys(topic){ const keys=new Set();
      String(topic||'').split(/[\/|,、，;；]+/).forEach(part=>{ const p=String(part||'').trim(); if(!p) return;
        (p.toLowerCase().match(/[a-z0-9À-ɏ]{3,}/g)||[]).forEach(w=>{ if(!_ATL_GENERIC_GEO.has(w)&&!_ATL_RELV_STOP.has(w)) keys.add(w); });
        (p.match(/[぀-ヿ㐀-鿿가-힯]{2,}/g)||[]).forEach(run=>{ keys.add(run.toLowerCase());
          const trimmed=run.replace(/[県府都市区町村州省郡島道地方]+$/,''); if(trimmed.length>=2) keys.add(trimmed.toLowerCase()); }); });
      return keys; }
    function _atlRelevantCards(cards, refText, topic){ try{
      const list=cards||[];
      const keys=_atlTopicKeys(topic);
      const ref=_atlTokens(refText);
      if(!keys.size&&ref.size<4) return list;   /* nothing to judge against — unchanged behaviour */
      const keysCJK=Array.from(keys).some(k=>/[぀-ヿ㐀-鿿가-힯]/.test(k));
      const keysLat=Array.from(keys).some(k=>/[a-z]/.test(k));
      return list.filter(c=>{
        const raw=((c&&(c.title||c.name||c.src))||'')+' '+((c&&c.url)||'');
        const txt=raw.toLowerCase();
        for(const k of keys){ if(k.length>=2&&txt.indexOf(k)>=0) return true; }   /* it names the topic */
        const cardCJK=/[぀-ヿ㐀-鿿가-힯]/.test(raw), cardLat=/[a-z]{4}/i.test(raw);
        /* the topic IS expressible in this card's script and the card does not use it → not about it */
        if(keys.size&&((cardCJK&&keysCJK)||(cardLat&&keysLat))) return false;
        if(ref.size<4) return false;
        let n=0; for(const w of _atlTokens(raw)){ if(ref.has(w)&&++n>=2) return true; }   /* cross-script: TWO tokens */
        return false; });
      }catch(_){ return cards; } }   /* never blank the section entirely — if nothing overlaps, fall back to the original set */
    /* (#R153) SINGLE source-URL cleaner — decode Google-News aggregator redirects to the REAL article, and reject
       aggregator / SNS / UGC / shortener / video hosts. Returns {url,host} or null. Used by BOTH linkCards AND the inline
       "article ↗" evidence links (mapReport / events) so EVERY rendered source goes through the same filter — the R152
       audit found the inline links bypassed it and leaked bare news.google.com / social URLs ("まったく関係ないリンク"). */
    function _atlCleanUrl(u){ try{ u=String(u||'').trim(); if(!/^https?:\/\//i.test(u)||u.length>700) return null;
      let agg=false;
      if(_isAggUrl(u)){ const dec=_decGNewsUrl(u); if(dec) u=dec; else agg=true; }   /* (#R154) undecodable Google-News redirect: KEEP it (clicking still redirects to the real article) rather than dropping to null — a whole batch of the newer opaque RSS links was being zeroed out = "出展が全くない". linkCards labels it by publisher, not "news.google.com". */
      let host=''; try{ host=new URL(u).hostname.replace(/^www\./,''); }catch(_){ return null; }
      if(agg) return {url:u, host:'news.google.com', agg:true};
      if(/(^|\.)news\.google\.com$/i.test(host)||/^news\.google$/i.test(host)) return null;
      if(_atlBadSourceHost(host)) return null;   /* drop SNS / UGC / shorteners / video hosts — not reliable factual sources */
      return {url:u, host}; }catch(_){ return null; } }
    /* (#R74) ChatGPT-style SOURCE LINK CARDS. (#R153) host-clean FIRST, THEN relevance (when refText is passed): the R152
       order (relevance → linkCards) could keep a coincidentally-matching SNS card and drop the real ones, then linkCards
       dropped the SNS one → an EMPTY section though real sources existed ("出展が全くない"). Cleaning first guarantees the
       relevance filter only ever chooses among renderable real-article cards, and its own fallback keeps them all if none
       match — so the section is never blank when genuine sources exist. Pass refText only for the "gathered" buckets;
       web-verified / model-cited sources are anchored to a claim and skip relevance. */
    /* ══ (#R232) A REPLY DOES NOT OPEN BY REPEATING THE NAME IT IS ABOUT ═════════════════════════
       Asked to "write a brief on X", a chat model opens with `# X` — which lands directly under a
       bubble that already reads 「Research: X」. Drop the FIRST non-blank line when, with markdown and
       punctuation stripped, it is nothing but that name; anything else is content and is kept.
       Here rather than at the call site because this file IS the reply text pipeline, and because
       js/atlas-console.js has a line ceiling (tests/r199-checks ⑤). */
    function dropLeadTitle(text, name){ try{
      const key=(s)=>String(s||'').replace(/[*_#`>\s]/g,'').replace(/[:：・.,、。()（）"'“”「」]/g,'').toLowerCase();
      const want=key(name); if(!want) return text;
      const ls=String(text).split(/\r?\n/); let i=0; while(i<ls.length&&!ls[i].trim()) i++;
      if(i>=ls.length||key(ls[i])!==want) return text;
      ls.splice(0,i+1); while(ls.length&&!ls[0].trim()) ls.shift(); return ls.join('\n');
    }catch(_){ return text; } }
    function linkCards(list, refText, topic){ try{
      const seen=new Set(); let clean=[];
      (list||[]).forEach(it=>{ if(!it||!it.url) return; const cu=_atlCleanUrl(it.url); if(!cu) return;
        const k=cu.url.replace(/[#?].*$/,''); if(seen.has(k)) return; seen.add(k);
        clean.push({url:cu.url, host:cu.host, agg:!!cu.agg, src:String(it.src||'').slice(0,60), title:String((it.title||it.src||cu.host)).slice(0,90)}); });
      /* (#R232) `topic` is what the articles were FETCHED FOR and is the primary relevance test; refText
         (the finished reply) is now only the cross-script fallback. Callers that anchor a card to a
         specific claim — web-verified / model-cited — still pass neither and skip relevance entirely. */
      if(refText||topic) clean=_atlRelevantCards(clean, refText, topic);
      if(!clean.length) return '';
      /* ⚠ (#R494) THE SEVENTH SOURCE IS NOT A SOURCE THE READER DECIDED NOT TO SEE. `slice(0,6)` was a
         SILENT truncation: a reply backed by nine articles showed six and said nothing, which reads on
         the screen as "these are the sources" — a claim about provenance that the code knew was false.
         The cap on what is VISIBLE stays (six cards is the row this layout was designed for); what
         changes is that the rest are rendered, hidden, behind a chip that says how many there are. */
      const card=c=>{ const dom=(c.agg&&c.src)?c.src:c.host;   /* (#R154) aggregator card shows the PUBLISHER name (from src), not the ugly "news.google.com" */
        return '<a class="atl-lc" href="'+esc(c.url)+'" target="_blank" rel="noopener">'
        +'<img class="atl-lc-ico" src="https://www.google.com/s2/favicons?domain='+esc(encodeURIComponent(c.host))+'&sz=64" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
        +'<span class="atl-lc-tx"><span class="atl-lc-t">'+esc(c.title)+'</span><span class="atl-lc-d">'+esc(dom)+'</span></span></a>'; };
      const shown=clean.slice(0,6).map(card).join('');
      const restList=clean.slice(6);
      if(!restList.length) return '<div class="atl-lc-row">'+shown+'</div>';
      const more=esc(L('Show all sources','すべてのソースを表示','Alle Quellen anzeigen','Показать все источники','Mostrar todas las fuentes'));
      return '<div class="atl-lc-row">'+shown
        +'<span class="atl-lc-rest" hidden>'+restList.map(card).join('')+'</span>'
        +'<button class="atl-lc-more" type="button" title="'+more+'" aria-label="'+more+'">+'+restList.length+'</button></div>'; }catch(_){ return ''; } }
    function listHtml(title,list,metric){ if(!list||!list.length) return note('⚠ '+L('No matching countries / metric unavailable.','該当国なし／指標が利用できません。','Keine passenden Länder / Kennzahl nicht verfügbar.','Нет данных по показателю.','Sin países coincidentes / métrica no disponible.'));
      const painted=highlight(list.map(r=>r.code)); fitTo(list.map(r=>r.code));
      return '<div style="font-weight:600;margin:2px 0 4px;">'+esc(title)+'</div><ol style="margin:0;padding-left:22px;line-height:1.65;font-size:12px;">'
        +list.map(r=>'<li>'+esc(r.name)+' <span style="color:var(--text-muted);">'+esc(fmtVal(metric,r.val))+'</span></li>').join('')+'</ol>'
        +(painted?'':warn('⚠ '+L('The map highlight could not be drawn (map still loading)','地図上のハイライトは描画できませんでした（地図読込中）','Kartenhervorhebung konnte nicht gezeichnet werden','Выделение на карте не нарисовано','El resaltado en el mapa no se pudo dibujar')));
    }
  return { _atlBadSourceHost, _atlCleanUrl, _atlRelevantCards, _atlStanza, dropLeadTitle, linkCards, listHtml, mdMini };
}
