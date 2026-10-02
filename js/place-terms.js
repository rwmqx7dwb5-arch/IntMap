/* ============================================================================
 *  IntMap · the in-page place-term matcher (news fallback scorer + publisher place scan)
 * ----------------------------------------------------------------------------
 *  js/news-context.js builds `HOST.geoDB` (≈16,000 entries, ≈48,000 terms) and asks two questions
 *  of it per headline: which entry scores highest over the title + description (the fallback when
 *  js/newsgeo.js declines), and which place a publisher string names. Both used to need one
 *  compiled RegExp pair per term, compiled for EVERY term on every rebuild.
 *
 *  ⚠ MEASURED (390×844, CPU ×4, the phone build): the world gazetteer arriving after boot triggered a
 *  rebuild that compiled ≈46,000 new matchers in one task — ≈0.55–0.6 s, the largest long task of the
 *  first seconds after the boot screen lifts. Almost none of them is ever used: a headline names a
 *  handful of places, and the scan only needs the matchers of the entries that COULD hit it.
 *
 *  So the matcher is made in two parts, and neither changes an answer:
 *    ① termsOf(g) compiles an entry's matchers the first time a question reaches that entry
 *       (still cached against the `terms` array, so a rebuild does not compile them again);
 *    ② candidates() is a prefilter that cannot drop a hit. Every matcher below — the Latin
 *       `\bterm\b`/i, the Cyrillic stem, and the CJK substring — can only match where the term
 *       itself occurs in the text under the RegExp's own case-insensitive rule. That rule is the
 *       spec's Canonicalize for a non-unicode /i pattern (ECMA-262 §22.2.2.7.3): one code unit at a
 *       time, its toUpperCase() if that is one code unit, except a non-ASCII unit never maps into
 *       ASCII. `canonUnit` below IS that rule, so if a matcher hits, the canonical form of the term
 *       is a substring of the canonical form of the text — and so is its first min(3, length) units.
 *       The index is keyed by exactly that prefix; the text offers every 1-, 2- and 3-unit window.
 *       A term of zero length can match anything, so its entry is always a candidate.
 *
 *  ⚠ ORDER IS PART OF THE ANSWER. geoDB is sorted longest-term-first and both scans keep the FIRST
 *  of equal results, so candidates are visited in their geoDB order — the scans below skip
 *  non-candidates and change nothing else. Pass `cand = null` and they visit every entry: that is
 *  the exhaustive scan, and tests/mobile-heavy-work-checks.test.mjs runs both over real headlines.
 * ==========================================================================*/

const ESC = /[.*+?^${}()|[\]\\]/g;
export function isCJKTerm(term){ return /[　-鿿]/.test(term); }
/* jp      — CJK terms match by substring; Latin terms match on word boundaries
   matchRe — word-boundary matcher for Latin terms
   ctxRe   — "is this place governed by a locational preposition / particle?"
             EN: in/at/to/from/near/into <place>   ·   JP: <place>で/へ/に/を/から */
export function compileTerm(term){
  const jp=isCJKTerm(term), cyr=/[Ѐ-ӿ]/.test(term), esc=term.replace(ESC,'\\$&');
  /* (#R39) Cyrillic/Russian path: JS `\b` word-boundaries don't fire around Cyrillic (it isn't `\w`),
     AND Russian inflects heavily — so match the supplied STEM plus up to 4 trailing Cyrillic letters,
     bounded by a non-Cyrillic-letter on the left (a consuming prefix, not lookbehind, for old-Safari
     safety). e.g. stem «Москв» → Москва/Москве/Москвы/Москву; «Росси» → России/Россию. */
  if(cyr){ return { term, jp:false, cyr:true,
    matchRe: new RegExp('(?:^|[^А-Яа-яЁёІіЇїЄє])'+esc+'[а-яёіїєa-z]{0,4}','i'),
    ctxRe:   new RegExp('(?:в|во|на|из|под|у|около)\\s+'+esc,'i') }; }
  return { term, jp,
    matchRe: jp?null:new RegExp(`\\b${esc}\\b`,'i'),
    ctxRe:   jp?new RegExp(`${esc}(?:で|へ|に|を|から|では)`)
               :new RegExp(`\\b(?:in|at|to|from|near|into)\\s+${esc}\\b`,'i') };
}

/* ── the case rule a non-unicode /i RegExp compares code units by (see the header) ─────────────
   Filled one code unit at a time, on first sight: 0 means "not computed yet" (and unit 0 maps to
   itself, so recomputing it is harmless). */
let CANON=null;
export function canonUnit(c){
  if(!CANON) CANON=new Uint16Array(65536);
  const v=CANON[c]; if(v) return v;
  const u=String.fromCharCode(c).toUpperCase();
  let r=c;
  if(u.length===1){ const cu=u.charCodeAt(0); if(!(c>=128&&cu<128)) r=cu; }
  CANON[c]=r; return r;
}
/* the first k (1..3) canonical units of a string as one number — 3 × 16 bits fits a double exactly */
function keyOf(s,k){
  let n=0;
  for(let i=0;i<k;i++) n=n*65536+canonUnit(s.charCodeAt(i));
  return n;
}

/* (#R311) THE COMPILED ARRAY IS CACHED AGAINST THE `terms` ARRAY, the one thing that persists
   across a rebuild (js/gazetteer.js memoises the matcher-shaped index and each row keeps its own
   `terms`; the rebuild makes fresh entry objects every pass). Measured then: of 193,014 compiles a
   boot, 145,701 were strings this page had already compiled.
   ⚠ THE CACHE IS VERIFIED, NOT ASSUMED: a hit is confirmed term by term against the array before it
   is used, because a stale matcher would be a silent wrong-place bug. A mismatch recompiles.
   ⚠ The RegExp objects are shared between passes, which is safe only because none carries a `g` or
   `y` flag (`lastIndex` is read and written for those only), and no reader mutates a compiled entry. */
export function makePlaceTerms(){
  let cache=null;
  function compileTerms(terms){
    if(!cache) cache=new WeakMap();
    const hit=cache.get(terms);
    if(hit&&hit.length===terms.length){
      let same=true;
      for(let i=0;i<hit.length;i++){ if(hit[i].term!==terms[i]){ same=false; break; } }
      if(same) return hit;
    }
    const out=terms.map(compileTerm);
    cache.set(terms,out);
    return out;
  }
  /* ① an entry's matchers, made the first time a question reaches it */
  function termsOf(g){ return g._terms||(g._terms=compileTerms(g.terms)); }

  /* ② the prefix index over one geoDB. A rebuild replaces geoDB, so the index is rebuilt on the
     first question asked of the new one — never at rebuild time, and never for a geoDB nobody asks. */
  let idxDb=null, idx=null;
  function index(db){
    if(idxDb===db&&idx) return idx;
    /* by[k]: first-k key → flat [entry, last-3 key (−1 when the term is ≤ 3 units), …].
       ⚠ A PREFIX ALONE IS NOT SELECTIVE: place names share their openings («San », «New », «Port»),
       and MEASURED over 466 real headlines it reached 10,535 of 15,650 entries. The last three units
       of the term must be in the same text as well — also a substring of any hit, so still no loss. */
    const by=[null,new Map(),new Map(),new Map()], always=[];
    for(let i=0;i<db.length;i++){
      const terms=db[i]&&db[i].terms; if(!terms) continue;
      for(let j=0;j<terms.length;j++){
        const t=terms[j];
        const s=(typeof t==='string')?t:String(t);
        const n=s.length, k=n<3?n:3;
        if(!k){ always.push(i); continue; }
        const key=keyOf(s,k), m=by[k], suf=n>3?keyOf(s.slice(n-3),3):-1;
        const a=m.get(key); if(a) a.push(i,suf); else m.set(key,[i,suf]);
      }
    }
    idxDb=db; idx={by,always};
    return idx;
  }
  /* the entries of `db` that any of `texts` could hit, as ascending positions */
  function candidates(db,...texts){
    const {by,always}=index(db);
    const mark=new Uint8Array(db.length), out=[];
    const add=(i)=>{ if(!mark[i]){ mark[i]=1; out.push(i); } };
    for(const i of always) add(i);
    for(const raw of texts){
      if(!raw) continue;
      const s=String(raw), n=s.length, cs=new Array(n), g3=new Set();
      for(let p=0;p<n;p++){
        cs[p]=canonUnit(s.charCodeAt(p));
        if(p>=2) g3.add((cs[p-2]*65536+cs[p-1])*65536+cs[p]);
      }
      const take=(a)=>{ if(a) for(let q=0;q<a.length;q+=2){ const suf=a[q+1]; if(suf<0||g3.has(suf)) add(a[q]); } };
      for(let p=0;p<n;p++){
        const c=cs[p];
        take(by[1].get(c));
        if(p>=1) take(by[2].get(cs[p-1]*65536+c));
        if(p>=2) take(by[3].get((cs[p-2]*65536+cs[p-1])*65536+c));
      }
    }
    out.sort((a,b)=>a-b);
    return out;
  }
  return { termsOf, candidates, compileTerms };
}

/* ===== Scoring model (replaces the old "first geo term wins" loop) =====
   Every geo entry is scored over the title + description; the highest score is the Subject.
      title hit          +10   strong signal — the headline names the place
      description hit     +3    supporting signal from the article snippet
      type "flashpoint"   +5    conflict zone / chokepoint → high news relevance
      type "city"         +2    precise locality
      locational context  +4    "in Gaza" / "ガザで" → the place is the story's setting
   Ties break toward the more local type (flashpoint > city > country > region). */
export const TYPE_SCORE={ flashpoint:5, city:2, country:0, region:0 };
export const TYPE_LOCAL={ flashpoint:4, city:3, country:2, region:1 };
export function scoreGeo(terms,g,title,desc){
  let titleHit=false, descHit=false, ctx=false, firstIdx=Infinity;
  for(const t of terms){
    if(t.jp){ const i=title.indexOf(t.term); if(i>=0){ titleHit=true; if(i<firstIdx) firstIdx=i; if(!ctx&&t.ctxRe.test(title)) ctx=true; } }
    else { const i=title.search(t.matchRe); if(i>=0){ titleHit=true; if(i<firstIdx) firstIdx=i; if(!ctx&&t.ctxRe.test(title)) ctx=true; } }
    if(desc&&(t.jp?desc.includes(t.term):t.matchRe.test(desc))){ descHit=true; if(!ctx&&t.ctxRe.test(desc)) ctx=true; }
  }
  if(!titleHit&&!descHit) return 0;
  /* (#R25/#28) Lead-subject bonus: a place named EARLY in the headline is much more likely to be what the
     story is about (e.g. "Kyiv strikes …" → Kyiv, not a country mentioned at the end). Up to +3. */
  const tl=title.length||1; const posBonus = titleHit ? Math.max(0, 3-Math.floor((Math.min(firstIdx,tl)/tl)*4)) : 0;
  /* (#R27) Corroboration bonus: a place named in BOTH the title AND the description is a stronger subject
     signal (+2). */
  const corro = (titleHit&&descHit) ? 2 : 0;
  /* (#R28) demonyms AND organizations/groups are docked so an explicit place name always outranks them
     (an "Ukrainian"/"Hamas"/"NATO" mention only places a story that names no explicit city/country). */
  const demPen = (g.demonym||g.org) ? 3 : 0;
  return (titleHit?10:0)+(descHit?3:0)+(TYPE_SCORE[g.type]||0)+(ctx?4:0)+posBonus+corro-demPen;
}
/* the highest-scoring entry over a headline; `cand` = ascending positions, or null for every entry */
export function bestSubject(db,title,desc,termsOf,cand){
  let best=null, bestScore=0;
  const n=cand?cand.length:db.length;
  for(let k=0;k<n;k++){
    const g=db[cand?cand[k]:k];
    const s=scoreGeo(termsOf(g),g,title,desc);
    if(s<=0) continue;
    if(s>bestScore || (s===bestScore && (!best||(TYPE_LOCAL[g.type]||0)>(TYPE_LOCAL[best.type]||0)))){ best=g; bestScore=s; }
  }
  return best;
}
/* (#R32) the most specific place a publisher string names ("Manila Bulletin", "Texas Tribune"…).
   Demonyms/orgs and terms shorter than 4 are skipped to avoid false hits. */
export function bestPublisherPlace(db,publisher,termsOf,cand){
  let best=null,bestLen=0,bestLocal=-1;
  const n=cand?cand.length:db.length;
  for(let k=0;k<n;k++){
    const g=db[cand?cand[k]:k];
    if(g.demonym||g.org||!g.terms) continue;
    for(const t of termsOf(g)){ const term=t.term; if(!term||term.length<4) continue;
      const hit = t.jp ? publisher.includes(term) : (t.matchRe&&t.matchRe.test(publisher));
      if(hit){ const loc=TYPE_LOCAL[g.type]||0;
        if(term.length>bestLen || (term.length===bestLen && loc>bestLocal)){ best=g; bestLen=term.length; bestLocal=loc; } } } }
  return best;
}
