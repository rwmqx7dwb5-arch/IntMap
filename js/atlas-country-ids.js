/* ============================================================================
 *  IntMap · the identifiers the border store itself declares   (#R742)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE STORE REFUSED ITS OWN KEY. The Atlas highlight reader keyed on ISO 3166-1 alpha-3 and
 *  on nothing else, while every feature it read carried `ISO_A2` ("DE"), `ISO_A3` ("DEU") and
 *  `ISO_N3` ("276") side by side. Measured on production 2026-09-15: the model sent
 *  `codes:['DE','FR']` and the reply told the READER "None of those identifiers could be matched
 *  to a boundary in the data IntMap holds" — a claim about the boundary data that was false, since
 *  the boundary data holds both spellings of the same identifier. Twelve consecutive highlights
 *  failed that way on one question ("Which EU countries use the euro?", 27 steps, 2m14s), because
 *  nothing in the failure told the model which notation to use; "Which African countries are
 *  landlocked?" reported fourteen ordinary ISO-3 codes as unmatched and drew all fourteen one step
 *  later. window.countryGeo held 258 features throughout.
 *
 *  Reading "DE" as "DEU" is NOT the meaning-guessing #R158 removed from that path. It is one
 *  identifier written in the other notation the SAME feature declares. Guessing would be turning a
 *  NAME into a code, and that still does not happen here — a request made only of names is handed
 *  to the concrete-place resolver instead, which is what the reader has documented since #R157.
 *
 *  ⚠ THE COLUMNS ARE NAMED; THE VALUES ARE NOT. Indexing every property blindly is wrong, and
 *  measurably so: Natural Earth gives Germany `FIPS_10` "GM", while ISO 3166-1 alpha-2 "GM" is
 *  Gambia. So only the ISO namespaces are read, and a token two features claim is dropped as
 *  ambiguous rather than resolved to whichever was walked first.
 *
 *  Observation: Natural Earth Admin-0 (js/countries-ui.js fetches ne_110m/50m/10m_admin_0_countries
 *  from nvkelso/natural-earth-vector); 258 of 258 features declared ISO_A2, ISO_A3 and ISO_N3 when
 *  measured on production 2026-09-15.
 *  Expires when: the border store stops being Natural Earth Admin-0, or stops declaring those
 *  columns. tests/r742-atlas-identifier-checks.test.mjs measures that rather than trusting it.
 *  Canonical: this file. The alpha-3 set with a real feature stays `_hlValidCodeSet` in the console.
 * ==========================================================================*/

/* the non-alpha-3 ISO notations the store declares beside the alpha-3 IntMap keys on */
export const ISO_ALIAS_COLS = ['ISO_A2', 'ISO_A2_EH', 'ISO_N3', 'ISO_N3_EH'];

/* Natural Earth writes -99 where it states no code; an absence is not an identifier. */
const TOKEN = /^([A-Z]{2}|[0-9]{3})$/;

/* countryIdIndex(featureCollection) → { map: Map(token → alpha-3), ambiguous: Set(token) }
   Pure: it reads the collection and nothing else, so CI measures the real thing. */
export function countryIdIndex(fc) {
  const map = new Map(), ambiguous = new Set();
  try {
    (fc && fc.features || []).forEach((f) => {
      const p = f.properties || {};
      const a3 = String(p.__code != null ? p.__code : (f.id != null ? f.id : '')).toUpperCase();
      if (!/^[A-Z]{3}$/.test(a3)) return;
      ISO_ALIAS_COLS.forEach((col) => {
        const v = p[col];
        if (v == null) return;
        const tok = String(v).trim().toUpperCase();
        if (!TOKEN.test(tok)) return;
        if (map.has(tok) && map.get(tok) !== a3) { ambiguous.add(tok); return; }
        map.set(tok, a3);
      });
    });
  } catch (_) { /* a malformed store yields an empty index, never a half-built one */ }
  ambiguous.forEach((t) => map.delete(t));   /* a token two features claim identifies neither */
  return { map, ambiguous };
}

/* makeHighlightTargets({geo, resolveCountrySync}) — the reader that turns what the model chose into
   validated country codes. It moved here WHOLE from js/atlas-console.js in #R742: it is pure given
   its two collaborators, and the kernel's line ceiling (tests/r318-checks ⑨b) is a shrink-only
   budget, so a reading that grows belongs outside it. `geo` is the border-store getter,
   `resolveCountrySync` the console's own country resolver (reported as a candidate, never applied). */
export function makeHighlightTargets(deps) {
  const geo = deps.geo, resolveCountrySync = deps.resolveCountrySync;
  let _idIdxCache = null, _idIdxFor = null;
  function _hlIdIndex(){ const g=geo(); if(_idIdxCache && _idIdxFor===g) return _idIdxCache;
    _idIdxCache=countryIdIndex(g); _idIdxFor=g; return _idIdxCache; }
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
    const _IX=_hlIdIndex();
    /* (#R742) an identifier token in ANY notation the store declares → the alpha-3 the store keys on.
       `notationOf` says which notation was read, so the reply states what it understood instead of
       swapping one spelling for another in silence. */
    const norm3=v=>{ v=String(v==null?'':v).trim().toUpperCase(); if(/^[A-Z]{3}$/.test(v)) return v; return _IX.map.get(v)||''; };
    const notationOf=v=>{ v=String(v==null?'':v).trim().toUpperCase(); return /^[A-Z]{3}$/.test(v)?'':(_IX.map.has(v)?v:''); };
    const readT=t=>{ if(t==null) return null;
      if(typeof t==='string'){ const c=norm3(t); return {iso3:c,name:c?'':t.trim(),via:notationOf(t)}; }
      if(typeof t==='object'){ const raw=t.iso3||t.iso||t.code||t.c||t.id||t.a3; const c=norm3(raw); const n=String(t.name||t.n||t.country||t.label||'').trim(); return (c||n)?{iso3:c,name:n,via:notationOf(raw)}:null; }
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
    const out=rawGroups.map(g=>{ const codes=[],unresolved=[],seen=new Set(),read=[];
      g.targets.forEach(t=>{ const gi=t.iso3||'';
        if(gi&&valid.has(gi)){ if(!seen.has(gi)){ seen.add(gi); codes.push(gi); if(t.via) read.push({as:t.via,code:gi}); } return; }   /* Terra's identifier is valid → execute faithfully */
        let available=[]; if(t.name){ try{ const c=resolveCountrySync(t.name); if(c&&c.code&&valid.has(String(c.code).toUpperCase())) available=[String(c.code).toUpperCase()]; }catch(_){} }
        unresolved.push({name:t.name||'', iso3:gi, reason:(gi?'iso3_not_in_border_data':(t.name?'no_iso3_provided':'empty_target')), availableIdentifiers:available}); });
      return {label:g.label,codes,unresolved,read}; });
    /* ⚠⚠⚠ (#R742) THE COMMENT ABOVE ALREADY PROMISED THIS AND THE CODE DID THE OPPOSITE. It states that a NAME
       array "does NOT [count as GPT targets] — those fall through to the legacy concrete-place resolver". But
       `readT` turns a non-code string into {iso3:'',name:'Germany'}, which makes `rawGroups` non-empty, so the
       fall-through never happened: the request died on this path and the reader was told IntMap holds no
       boundary for the place. Measured on production 2026-09-15: resolveHl('Germany')→DEU,
       resolveHl('ドイツ')→DEU, resolveHl('Korean Peninsula')→a real polygon (admin_union, bbox
       124.21..131.86 / 33.20..43.01) — the resolver that could answer is one function away, and
       "⚠ Place not found: Korean Peninsula" shipped anyway.
       So: when NOTHING in the request was an identifier, this path read nothing and says so by returning null,
       exactly as it documents. A MIXED request (some codes, some names) still belongs here — #R158's contract
       is that a valid identifier is executed as-is and the rest is REPORTED, never guessed. */
    const noneWasAnIdentifier=rawGroups.every(g=>g.targets.every(t=>!t.iso3));
    if(noneWasAnIdentifier) return null;
    return out; }catch(_){ return null; } }
  return { idIndex: _hlIdIndex, validCodeSet: _hlValidCodeSet, readGroups: _hlReadGptGroups };
}

export default countryIdIndex;
