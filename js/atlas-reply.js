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
export function makeAtlasReply(HOST, CTX) {
  const L=CTX.L, esc=CTX.esc, fitTo=CTX.fitTo, fmtVal=CTX.fmtVal, highlight=CTX.highlight, note=CTX.note, warn=CTX.warn;
    /* (#R62) minimal safe markdown for AI text rendered in the chat (briefs / analyses). */
    /* (#R137) Atlas occasionally emits the SAME sentence/paragraph twice verbatim in one reply ("たまに二度同じことを
       …同じ文章をそのまま繰り返す"). Strip verbatim-duplicate paragraphs and sentences (normalized, length-gated so short
       repeats like list labels or "はい。" survive). Spacing is preserved by keeping each sentence's trailing whitespace
       and rejoining with '' — so nothing is dropped unless a long duplicate key is seen. Fully guarded → original on error. */
    function _dedupText(s){ s=String(s==null?'':s); if(!s||s.length<24) return s;
      try{
        const MIN=15; const norm=x=>String(x).trim().replace(/\s+/g,' ').toLowerCase();
        const seenSent=new Set();
        const dedupLine=(line)=>{ const toks=line.match(/[^.!?。！？]*[.!?。！？]+\s*|[^.!?。！？]+$/g); if(!toks) return line;
          const out=[]; for(const tk of toks){ const k=norm(tk); if(k.length>=MIN){ if(seenSent.has(k)) continue; seenSent.add(k); } out.push(tk); }
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
      const paras=raw.split(/\n\s*\n|\n/).map(s=>s.trim()).filter(Boolean);
      if(!paras.length) return raw;
      if((plainAll.length+cjk)<=150 && paras.length<2) return raw;            /* a one-line answer doesn't need reflow */
      const isList=p=>/^\s*(?:[-・*•]|\d+[.)、]|[①-⑳])\s/.test(p);
      const SENT=/[^.!?。！？…]+(?:[.!?。！？…]+["”』）)]*|$)/g;
      const out=[];
      for(const p of paras){
        if(isList(p)){ out.push(p.replace(/^\s*(?:\d+[.)、]|[①-⑳])[ \t　]+/,'- ').replace(/^\s*[•・*][ \t　]+/,'- ')); continue; }
        const pc=(p.match(/[぀-ヿ㐀-鿿가-힯]/g)||[]).length;
        if((p.length+pc)>230){ const sents=p.match(SENT)||[p];                /* long run-on → ~2-sentence stanzas (spacing only, no enlargement) */
          if(sents.length>=3){ for(let i=0;i<sents.length;i+=2) out.push(sents.slice(i,i+2).join(' ').trim()); continue; } }
        out.push(p);
      }
      return out.join('\n\n'); }
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
    function _atlCodeBlock(code, lang){ code=String(code).replace(/\n+$/,''); const id='atlcb'+(_atlCbSeq++);
      const lbl=lang?esc(String(lang).slice(0,24)):'';
      return '<div class="atl-codewrap"><div class="atl-codebar"><span class="atl-codelang">'+(lbl||'code')+'</span>'
        +'<button class="atl-codecopy" type="button" data-cid="'+id+'">'+esc(L('Copy','コピー','Kopieren','Копировать','Copiar'))+'</button></div>'
        +'<pre class="atl-codeblock"><code id="'+id+'">'+esc(code)+'</code></pre></div>'; }
    function _atlCellFmt(s){ return esc(String(s==null?'':s)).replace(/\*\*([^*]+)\*\*/g,'$1'); }   /* (#R159) table cells: strip **bold** markers to plain — Atlas replies carry no bold (inline code/math placeholders survive esc + restore globally) */
    function _atlBuildTable(header, sep, body){
      const cut=r=>String(r).trim().replace(/^\|/,'').replace(/\|$/,'').split(/\|/).map(x=>x.trim());
      const aligns=cut(sep).map(s=>{ const l=/^:/.test(s), r=/:$/.test(s); return (r&&l)?'center':r?'right':l?'left':''; });
      const th=cut(header); const rows=body.map(cut); const al=i=>aligns[i]?(' style="text-align:'+aligns[i]+'"'):'';
      let h='<div class="atl-tablewrap"><table class="atl-md-table"><thead><tr>';
      th.forEach((c,i)=>{ h+='<th'+al(i)+'>'+_atlCellFmt(c)+'</th>'; }); h+='</tr></thead><tbody>';
      rows.forEach(r=>{ h+='<tr>'; for(let i=0;i<th.length;i++){ h+='<td'+al(i)+'>'+_atlCellFmt(r[i])+'</td>'; } h+='</tr>'; });
      return h+'</tbody></table></div>'; }
    function mdMini(s){ s=String(s||''); const B=[], I=[];
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
        while(i<ls.length){ if(isRow(ls[i])&&i+1<ls.length&&isSep(ls[i+1])){ const hdr=ls[i], sp=ls[i+1], bd=[]; let j=i+2; while(j<ls.length&&isRow(ls[j])){ bd.push(ls[j]); j++; } out.push(pB(_atlBuildTable(hdr,sp,bd))); i=j; } else { out.push(ls[i]); i++; } }
        return out.join('\n'); })(s);
      /* 3) the EXISTING R154/R155 typography pipeline — the text is now placeholder-protected (code/math/tables intact).
         (#R154) HEADINGS DIFFERENTIATE BY SIZE + SPACING ONLY — NO COLOUR ("目次を色分けするのはやめる"). (#R155) a "## "
         section also gets a subtle neutral top hairline = pure 配置/placement. */
      let html=esc(_dedupText(_atlStanza(s)))
        /* (#R158) STRONGER design contrast via SIZE / WEIGHT / SPACING / neutral dividers ONLY — still no colour-coding and
           no fabricated headings (R154 constraints kept). Bigger size jumps + heavier weight + more generous rhythm + a more
           visible section hairline give the flat, monotone reply the structure the user asked for ("コントラストに乏しい"). */
        /* (#R159) headings differentiate by SIZE + SPACING only — no heavy bold weight ("返答のテキストは太字にしない") and
           no "##" top-rule divider ("区切りの横線はいらない"). Down from 750/800 to a light 600; border-top removed. */
        /* ══ (#R232) 「各見出しと、その前後の本文に間隔があきすぎに思える」 ═══════════════════════════
           The gap around a heading was never one number — it was TWO, added together and never counted:
           the heading's own margin, PLUS the blank-line spacer the paragraph rule below emits for the
           `\n\n` that always surrounds a markdown heading. A `## ` section therefore opened with
           2.05em + 1.5em = 3.55em of nothing above it and 0.62em + 1.5em = 2.12em below.
           ⚠ THE MARGINS ARE TIGHTENED **AND** THE DOUBLE COUNT IS REMOVED (see the post-pass at the end
           of this function). The paragraph rhythm between ordinary paragraphs is deliberately unchanged
           — #R158 widened it on request and this instruction is about headings, not about the body. */
        .replace(/^#{3,6}\s*(.+)$/gm,'<div class="atl-h" style="font-weight:600;color:var(--text-main);margin:1.05em 0 .3em;font-size:1.3em;line-height:1.3;letter-spacing:.004em;">$1</div>')
        .replace(/^##\s*(.+)$/gm,'<div class="atl-h" style="font-weight:600;color:var(--text-main);margin:1.3em 0 .38em;font-size:1.56em;line-height:1.25;letter-spacing:.006em;">$1</div>')
        .replace(/^#\s*(.+)$/gm,'<div class="atl-h" style="font-weight:600;color:var(--text-main);margin:1.1em 0 .4em;font-size:1.9em;letter-spacing:.012em;line-height:1.2;">$1</div>')
        /* (#R151/#R154) a whole-line **bold run** is an author-written section lead → modest heading (size+spacing, no colour) */
        .replace(/^\*\*([^*\n]{2,90})\*\*[ \t]*:?[ \t]*$/gm,'<div class="atl-h" style="font-weight:600;color:var(--text-main);margin:1.0em 0 .3em;font-size:1.28em;line-height:1.3;">$1</div>')
        .replace(/\*\*([^*]+)\*\*/g,'$1')                                                             /* (#R159) inline **bold** → plain: Atlas reply body carries no bold */
        .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g,'$1<i>$2</i>')                      /* (#R156) *italic* (single asterisk; guarded so ** and "2 * 3"/bullets don't misfire) */
        .replace(/^&gt;\s?(.+)$/gm,'<div style="border-left:3px solid rgba(128,128,128,.4);padding:3px 0 3px 13px;margin:.7em 0;color:var(--text-muted);">$1</div>')   /* (#R156) > blockquote (esc turned > into &gt;) */
        /* (#R74) markdown links → real (safe) anchors */
        .replace(/\[([^\]\n]{1,120})\]\((https?:[^)\s]{4,300})\)/g,(m,t,u)=>'<a href="'+u+'" target="_blank" rel="noopener" style="color:var(--primary-color);text-decoration:none;border-bottom:1px solid currentColor;">'+t+'</a>')
        /* (#R79g) linkify BARE urls too (leading-char guard skips urls already inside an href="…") */
        .replace(/(^|[^"'=>\/])(https?:\/\/[^\s<)"']+)/g,(m,pre,u)=>pre+'<a href="'+u+'" target="_blank" rel="noopener" style="color:var(--primary-color);text-decoration:none;border-bottom:1px solid currentColor;word-break:break-all;">'+u+'</a>')
        .replace(/^[-・*]\s+(.+)$/gm,'<div style="padding-left:1.35em;text-indent:-1.1em;margin:.42em 0;line-height:1.6;">•&nbsp; $1</div>')   /* (#R158) clearer bullets + more air */
        .replace(/\n{2,}/g,'<div class="atl-gap" style="height:1.5em"></div>')                         /* (#R158) paragraph gap (bigger rhythm) */
        .replace(/([.!?。！？…”"』）)])\n(?=\S)/g,'$1<div style="height:.82em"></div>')                 /* (#R150-R158) sentence-end + single newline = soft gap */
        .replace(/\n/g,'<br>');
      /* ⚠ (#R232) THE SECOND HALF OF THE HEADING-SPACING FIX — drop the paragraph spacer that lands
         against a heading. A markdown heading is a line surrounded by blank lines, so the rule above
         ALWAYS emits a 1.5em spacer on each side of one; that spacer is what a paragraph gap means
         BETWEEN TWO PARAGRAPHS, and next to a heading whose own margin already provides the air it
         simply means twice the intended gap. The `<br>` case is the same defect with a single newline.
         Tempered `(?:(?!</div>)[\s\S])*` stops at the heading div's own close tag — heading text at
         this point is plain, its code/math/table content having been swapped out for placeholders. */
      html=html
        .replace(/<div class="atl-gap"[^>]*><\/div>(?=<div class="atl-h")/g,'')
        .replace(/(<div class="atl-h"[^>]*>(?:(?!<\/div>)[\s\S])*<\/div>)(?:<div class="atl-gap"[^>]*><\/div>|<br>)/g,'$1');
      /* 4) restore protected blocks (may hold inline placeholders) THEN inlines */
      return html.replace(/B(\d+)/g,(m,i)=>B[+i]||'').replace(/I(\d+)/g,(m,i)=>I[+i]||''); }
    /* (#R156) ONE-TIME wiring for the renderer's interactive bits, at document level so it works in EVERY Atlas
       surface (floating panel, sidebar tab, workspace window): (a) a Copy button on each code block copies the raw
       code + flips its label for ~1.4s; (b) if KaTeX finishes loading AFTER a reply was painted (slow CDN — rare,
       since it is a defer script that runs before DOMContentLoaded), upgrade the escaped-raw fallbacks in place. */
    function _atlFallbackCopy(txt){ try{ const ta=document.createElement('textarea'); ta.value=String(txt||''); ta.style.cssText='position:fixed;left:-9999px;top:0;'; document.body.appendChild(ta); ta.focus(); ta.select(); try{ document.execCommand('copy'); }catch(_){} ta.remove(); }catch(_){} }
    try{ if(!window.__atlRenderWired){ window.__atlRenderWired=true;
      document.addEventListener('click',e=>{ try{ const b=e.target.closest&&e.target.closest('.atl-codecopy'); if(!b) return;
        const code=document.getElementById(b.getAttribute('data-cid')); const txt=code?(code.textContent||''):'';
        const done=()=>{ const old=b.textContent; b.textContent=L('Copied','コピー済み','Kopiert','Скопировано','Copiado'); b.classList.add('ok'); setTimeout(()=>{ try{ b.textContent=old; b.classList.remove('ok'); }catch(_){} },1400); };
        try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(()=>{ _atlFallbackCopy(txt); done(); }); } else { _atlFallbackCopy(txt); done(); } }catch(_){ _atlFallbackCopy(txt); done(); }
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
      const cards=clean.slice(0,6).map(c=>{ const dom=(c.agg&&c.src)?c.src:c.host;   /* (#R154) aggregator card shows the PUBLISHER name (from src), not the ugly "news.google.com" */
        return '<a class="atl-lc" href="'+esc(c.url)+'" target="_blank" rel="noopener">'
        +'<img class="atl-lc-ico" src="https://www.google.com/s2/favicons?domain='+esc(encodeURIComponent(c.host))+'&sz=64" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
        +'<span class="atl-lc-tx"><span class="atl-lc-t">'+esc(c.title)+'</span><span class="atl-lc-d">'+esc(dom)+'</span></span></a>'; });
      return '<div class="atl-lc-row">'+cards.join('')+'</div>'; }catch(_){ return ''; } }
    function listHtml(title,list,metric){ if(!list||!list.length) return note('⚠ '+L('No matching countries / metric unavailable.','該当国なし／指標が利用できません。','Keine passenden Länder / Kennzahl nicht verfügbar.','Нет данных по показателю.','Sin países coincidentes / métrica no disponible.'));
      const painted=highlight(list.map(r=>r.code)); fitTo(list.map(r=>r.code));
      return '<div style="font-weight:600;margin:2px 0 4px;">'+esc(title)+'</div><ol style="margin:0;padding-left:22px;line-height:1.65;font-size:12px;">'
        +list.map(r=>'<li>'+esc(r.name)+' <span style="color:var(--text-muted);">'+esc(fmtVal(metric,r.val))+'</span></li>').join('')+'</ol>'
        +(painted?'':warn('⚠ '+L('The map highlight could not be drawn (map still loading)','地図上のハイライトは描画できませんでした（地図読込中）','Kartenhervorhebung konnte nicht gezeichnet werden','Выделение на карте не нарисовано','El resaltado en el mapa no se pudo dibujar')));
    }
  return { _atlBadSourceHost, _atlCleanUrl, _atlRelevantCards, _atlStanza, dropLeadTitle, linkCards, listHtml, mdMini };
}
