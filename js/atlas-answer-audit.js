/* ============================================================================
 *  IntMap · ATLAS — THE ANSWER AUDIT: what the structure lets us actually check  (#R350)
 * ----------------------------------------------------------------------------
 *  ⚠ THIS IS NOT A SELF-CHECK PROMPT. Every rule below is decided by this code over the envelope
 *  and the evidence registry — a model's own opinion of its answer is exactly the thing that was
 *  already wrong. The model may be asked ONCE to repair what this found; it is never the judge.
 *
 *  The reported failure is six defects in one reply, and each one is a rule here:
 *
 *    ① the opening sentence asserted an exclusive verdict its own body refutes
 *         → lead.exclusive_without_evidence · lead.contradicts_body · contradiction.superlative_beaten
 *    ② 構成比 / 成長寄与 / 供給能力 were merged into one word
 *         → dimension.unspecified · lead.dimension_unstated
 *    ③ 「工業付加価値」 and 「規模以上工業の増加率」 were chained as one series
 *         → series.mixed_series_in_claim · series.basis_mixed · metric.period_mismatch
 *    ④ a broken URL appeared in the prose
 *         → url.raw_in_prose · url.host_in_prose  (and canonicalizeUrl refuses to register it)
 *    ⑤ the source cards were not tied to any particular statement
 *         → evidence.primary_unsupported · metric.value_unsupported · schema.unknown_evidence_ref
 *    ⑥ 「Web検証済み」 was a heading rather than a fact
 *         → web.unverified_label · citation.call_mismatch
 *
 *  ⚠ SEVERITY IS THE CONTRACT WITH THE UI. An `error` that survives means the turn may not be
 *  rendered as a finished answer — js/atlas-console.js repairs once, then DEGRADES (drops what
 *  could not be verified and says so). A `warning` is recorded and shown to nobody but the
 *  developer trace; it never blocks.
 *
 *  Pure over (envelope, registry, ctx). tests/r334-checks.test.mjs mutates a correct answer one
 *  field at a time and asserts each mutation lands on its own code — a gate never seen red proves
 *  nothing (#R318 ②).
 * ==========================================================================*/

import { makeAtlasAnswerContract } from './atlas-answer-contract.js';

export function makeAtlasAnswerAudit() {
  return (function () {
  const { numericTokens, unitClass, renderedTexts, referencedClaimIds, claimById } = makeAtlasAnswerContract();

  const AUDIT_CODES = {
    /* structure */
    'schema.empty_direct_answer': 'error',
    'schema.no_primary_claim': 'error',
    'schema.duplicate_id': 'error',
    'schema.unknown_claim_ref': 'error',
    'schema.unknown_evidence_ref': 'error',
    'schema.claim_not_rendered': 'warning',
    /* claim ↔ evidence */
    'evidence.primary_unsupported': 'error',
    'evidence.inference_as_fact': 'error',
    'evidence.inference_without_basis': 'error',
    'evidence.current_without_time': 'error',
    'evidence.causal_single_lead': 'error',
    /* what a URL may be */
    'url.raw_in_prose': 'error',
    'url.host_in_prose': 'error',
    /* what a number must carry */
    'metric.missing': 'error',
    'metric.missing_series_id': 'error',
    'metric.missing_period': 'error',
    'metric.missing_unit': 'error',
    'metric.missing_basis': 'warning',
    'metric.missing_geography': 'warning',
    'metric.unit_mismatch': 'error',
    'metric.percent_vs_point_confusion': 'error',
    'metric.period_mismatch': 'error',
    'metric.value_unsupported': 'error',
    'metric.value_unattributed': 'warning',
    /* series compatibility */
    'series.mixed_series_in_claim': 'error',
    'series.basis_mixed': 'error',
    'series.unsupported_series': 'error',
    /* meaning */
    'dimension.unspecified': 'error',
    'lead.not_primary': 'error',
    'lead.dimension_unstated': 'error',
    'lead.exclusive_without_evidence': 'error',
    'lead.contradicts_body': 'error',
    /* internal contradiction */
    'contradiction.superlative_beaten': 'error',
    'contradiction.direction_flip': 'error',
    'contradiction.value_mismatch': 'error',
    /* provenance of the citation itself */
    'web.unverified_label': 'error',
    'citation.call_mismatch': 'error',
  };

  /* ⚠ 「よりも」ではなく「より」だけを見ると、日本語の助詞をすべて比較と読んでしまう。 The set below is
     deliberately the EXCLUSIVE forms — the ones that assert one thing over another — because those are
     the ones that need a measured claim on both sides. */
  const EXCLUSIVE_RE = /(よりも|ではなく|ではなくて|主因|主たる要因|真の要因|実際には|実のところ|最大の|一番の|rather than|instead of|not\s+[^.]{2,40}\s+but\b|primarily|mainly|chiefly|above all|the main (driver|reason|factor)|in fact\b)/i;
  const SUPERLATIVE_RE = /(最大|最も大きい|最も多い|最も高い|一番大きい|トップ|largest|biggest|greatest|highest|the most\b)/i;
  const UP_RE = /(増加|拡大|上昇|伸び|増えた|成長した|rose|increased|grew|expanded|up\b)/i;
  const DOWN_RE = /(減少|縮小|低下|落ち込|減った|fell|declined|shrank|decreased|down\b)/i;
  const INFERENCE_HEDGE_RE = /(と考えられ|とみられ|可能性|推定|示唆|評価|判断|likely|appears|suggests|probably|assessment|estimate)/i;

  const URL_RE = /(https?:\/\/|\]\(\s*https?:|(^|[^\w@])www\.[a-z0-9-]+\.[a-z]{2,})/i;
  const TLD = 'com|org|net|gov|edu|int|mil|info|io|co|cn|jp|uk|de|fr|ru|es|kr|tw|hk|eu|us|ca|au|in|br|it|nl|se|ch|sg|kz|tj|uz';
  const HOSTISH_RE = new RegExp('\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.){2,}(?:' + TLD + ')\\b', 'gi');

  const EPS = 1e-6;
  const near = (a, b) => (a != null && b != null && Math.abs(a - b) <= Math.max(EPS, Math.abs(b) * 1e-4));

  /** Which of a claim's referenced evidence records actually exist, as records. */
  function claimEvidence(claim, registry) {
    return (claim.evidenceIds || []).map((id) => registry.get(id)).filter(Boolean);
  }

  /** The recorded fact a figure in a sentence came from, if any of the cited records carries it. */
  function matchFact(value, records) {
    for (const r of records) {
      for (const f of (r.supportFacts || [])) {
        if (f.value != null && near(value, f.value)) return { fact: f, record: r };
      }
    }
    return null;
  }

  function anyFacts(records) { return records.some((r) => (r.supportFacts || []).length > 0); }

  /**
   * auditAnswer(env, registry, ctx) -> {status, errors, warnings}
   * ctx: {webUsed:boolean, temporalMode:string}
   */
  function auditAnswer(env, registry, ctx) {
    ctx = ctx || {};
    const out = [];
    const push = (code, detail, claimId) => {
      const severity = AUDIT_CODES[code] || 'error';
      out.push({ code, severity, detail: String(detail || ''), claimId: claimId || '' });
    };
    if (!env || !env.answer) { push('schema.empty_direct_answer', 'no envelope'); return verdict(out); }

    const claims = env.claims || [];
    const byId = claimById(env);
    const lead = env.answer.directAnswer || { text: '', claimIds: [] };

    /* ── ① STRUCTURE ─────────────────────────────────────────────────────────────────────────── */
    if (!String(lead.text || '').trim()) push('schema.empty_direct_answer', 'directAnswer.text is empty');
    const seenIds = new Set();
    claims.forEach((c) => { if (seenIds.has(c.id)) push('schema.duplicate_id', c.id, c.id); seenIds.add(c.id); });

    const referenced = referencedClaimIds(env);
    referenced.forEach((id) => { if (!byId.has(id)) push('schema.unknown_claim_ref', id); });
    claims.forEach((c) => { if (!referenced.has(c.id)) push('schema.claim_not_rendered', c.id, c.id); });

    claims.forEach((c) => {
      (c.evidenceIds || []).forEach((id) => { if (!registry.get(id)) push('schema.unknown_evidence_ref', c.id + ' → ' + id, c.id); });
      (c.basedOn || []).forEach((id) => { if (!byId.has(id)) push('schema.unknown_claim_ref', c.id + ' → ' + id, c.id); });
    });

    const primaries = claims.filter((c) => c.importance === 'primary');
    if (!primaries.length) push('schema.no_primary_claim', 'no claim is marked primary');

    /* ── ② PROVENANCE OF THE CITATIONS THEMSELVES ────────────────────────────────────────────── */
    const records = registry.all();
    if (ctx.webUsed === false && records.some((r) => r.origin === 'hosted_web')) {
      push('web.unverified_label', 'hosted_web evidence exists but the hosted search did not run this call');
    }
    records.forEach((r) => {
      if (registry.callId && r.callId && !(registry.ownsCall ? registry.ownsCall(r.callId) : String(r.callId) === String(registry.callId))) {
        push('citation.call_mismatch', r.id + ' carries callId ' + r.callId);
      }
    });

    /* ── ③ NO URL, NO HOST NAME, IN THE PROSE ────────────────────────────────────────────────── */
    const hosts = registry.hosts();
    renderedTexts(env).forEach((t) => {
      if (URL_RE.test(t.text)) push('url.raw_in_prose', t.where);
      HOSTISH_RE.lastIndex = 0;
      let m;
      while ((m = HOSTISH_RE.exec(t.text))) {
        const h = m[0].toLowerCase().replace(/^www\./, '');
        if (!hosts.has(h)) push('url.host_in_prose', t.where + ': ' + h);
      }
    });

    /* ── ④ EVERY CLAIM: support, meaning, and the figures in its own sentence ────────────────── */
    claims.forEach((c) => {
      const recs = claimEvidence(c, registry);
      const weighty = (c.importance === 'primary' || c.importance === 'major');
      const tokens = numericTokens(c.text);
      const numeric = tokens.length > 0 || (c.metric && c.metric.value != null);

      if (!c.dimension && weighty) push('dimension.unspecified', c.id, c.id);

      if (c.claimType === 'inference' || c.claimType === 'judgment') {
        if (!INFERENCE_HEDGE_RE.test(c.text)) push('evidence.inference_as_fact', c.id, c.id);
        if (!(c.basedOn || []).length) push('evidence.inference_without_basis', c.id, c.id);
      } else {
        if (c.importance === 'primary' && !recs.length) push('evidence.primary_unsupported', c.id, c.id);
        if (weighty && numeric && !recs.length) push('evidence.primary_unsupported', c.id + ' (numeric)', c.id);
      }

      if (weighty && ctx.temporalMode === 'current' && c.claimType === 'fact' && recs.length &&
          !recs.some((r) => r.retrievedAt || r.validTime)) {
        push('evidence.current_without_time', c.id, c.id);
      }

      if (c.importance === 'primary' && c.dimension === 'causal_driver' && recs.length === 1 &&
          recs[0].origin === 'client_source' && !(recs[0].supportFacts || []).length) {
        push('evidence.causal_single_lead', c.id + ' rests on one undated headline lead', c.id);
      }

      if (!numeric) return;

      /* ─ the metric block a figure obliges the claim to carry ─ */
      const m = c.metric;
      if (!m) { push('metric.missing', c.id, c.id); return; }
      if (!m.seriesId) push('metric.missing_series_id', c.id, c.id);
      if (!m.period) push('metric.missing_period', c.id, c.id);
      if (!m.unit) push('metric.missing_unit', c.id, c.id);
      if (!m.basis) push('metric.missing_basis', c.id, c.id);
      if (!m.geography) push('metric.missing_geography', c.id, c.id);

      const declared = unitClass(m.unit);
      /* ⚠ A GROWTH CONTRIBUTION IS MEASURED IN PERCENTAGE POINTS AND A SHARE IS NOT. This is the one
         unit confusion that changes the ANSWER rather than the presentation: 2.6 points of growth and
         2.6 % of GDP are different statements about consumption and only one of them is true. */
      if (c.dimension === 'growth_contribution' && declared === 'percent') {
        push('metric.percent_vs_point_confusion', c.id + ': growth_contribution declared in percent', c.id);
      }
      if (c.dimension === 'share' && declared === 'percentage_point') {
        push('metric.percent_vs_point_confusion', c.id + ': share declared in percentage points', c.id);
      }

      /* ─ each figure in the sentence against the facts the cited records actually carry ─ */
      const matchedSeries = new Set(), matchedBases = new Set();
      const haveFacts = anyFacts(recs);
      tokens.forEach((tk) => {
        if (tk.unitClass && declared && tk.unitClass !== declared) {
          push('metric.unit_mismatch', c.id + ': sentence says ' + (tk.unit || tk.unitClass) + ', metric says ' + m.unit, c.id);
        }
        const hit = matchFact(tk.value, recs);
        if (!hit) {
          /* ⚠ THE TWO HALVES OF «UNSUPPORTED». When the cited records carry measured facts we can say a
             figure is WRONG; when they carry none (a news article has a headline, not a series) we can
             only say it is unattributed. Reporting the second as the first would make every live news
             answer unrenderable, which is how a gate stops being run. */
          if (haveFacts) push('metric.value_unsupported', c.id + ': ' + tk.value + ' matches no recorded fact', c.id);
          else push('metric.value_unattributed', c.id + ': ' + tk.value, c.id);
          return;
        }
        if (hit.fact.seriesId) matchedSeries.add(hit.fact.seriesId);
        if (hit.fact.basis) matchedBases.add(hit.fact.basis);
        const factClass = unitClass(hit.fact.unit);
        if (declared && factClass && declared !== factClass) {
          push('metric.unit_mismatch', c.id + ': ' + hit.fact.seriesId + ' is ' + hit.fact.unit + ', metric says ' + m.unit, c.id);
        }
        if (m.period && hit.fact.period && m.period !== hit.fact.period) {
          push('metric.period_mismatch', c.id + ': metric ' + m.period + ' vs ' + hit.fact.seriesId + ' ' + hit.fact.period, c.id);
        }
      });
      /* ⚠ THIS IS THE 「異なる定義の数値を一つの系列として接続してはいけない」 RULE, AND IT IS DECIDED BY
         WHERE THE FIGURES CAME FROM — not by a list of forbidden phrase pairs. Two figures in one
         sentence that resolve to two different series is exactly the defect, whatever the sentence
         calls them. */
      if (matchedSeries.size > 1) {
        push('series.mixed_series_in_claim', c.id + ': ' + Array.from(matchedSeries).join(' + '), c.id);
      }
      if (matchedBases.size > 1) {
        push('series.basis_mixed', c.id + ': ' + Array.from(matchedBases).join(' + '), c.id);
      }
      if (m.seriesId && matchedSeries.size && !matchedSeries.has(m.seriesId)) {
        push('series.unsupported_series', c.id + ': declares ' + m.seriesId + ', figures come from ' + Array.from(matchedSeries).join(' + '), c.id);
      }
    });

    /* ── ⑤ THE OPENING SENTENCE, AUDITED HARDER THAN ANY LINE OF THE BODY ────────────────────── */
    const leadClaims = (lead.claimIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (String(lead.text || '').trim()) {
      if (!leadClaims.some((c) => c.importance === 'primary')) push('lead.not_primary', 'directAnswer cites no primary claim');
      if (!leadClaims.some((c) => c.dimension)) push('lead.dimension_unstated', 'the opening sentence names no dimension');
      if (EXCLUSIVE_RE.test(lead.text)) {
        /* an exclusive verdict needs BOTH sides measured, in the SAME dimension */
        const dims = new Set(leadClaims.map((c) => c.dimension).filter(Boolean));
        let ok = false;
        dims.forEach((d) => {
          const sides = claims.filter((c) => c.dimension === d && c.metric && c.metric.value != null && (c.evidenceIds || []).length);
          if (sides.length >= 2) ok = true;
        });
        if (!ok) push('lead.exclusive_without_evidence', 'the opening sentence rules one thing over another with fewer than two measured claims in one dimension');
      }
    }

    /* ── ⑥ THE ANSWER AGAINST ITSELF ─────────────────────────────────────────────────────────── */
    const measured = claims.filter((c) => c.dimension && c.metric && c.metric.value != null);
    measured.forEach((c) => {
      if (!SUPERLATIVE_RE.test(c.text)) return;
      const cls = unitClass(c.metric.unit);
      const beaten = measured.find((o) => o !== c && o.dimension === c.dimension && unitClass(o.metric.unit) === cls &&
        (o.metric.concept || o.id) !== (c.metric.concept || c.id) && o.metric.value > c.metric.value + EPS);
      if (beaten) {
        push('contradiction.superlative_beaten',
          c.id + ' claims the largest ' + c.dimension + ' at ' + c.metric.value + ', but ' + beaten.id + ' is ' + beaten.metric.value, c.id);
        if ((lead.claimIds || []).indexOf(c.id) >= 0) {
          push('lead.contradicts_body', 'the opening sentence rests on ' + c.id + ', which the body outranks with ' + beaten.id);
        }
      }
    });
    for (let i = 0; i < measured.length; i++) {
      for (let j = i + 1; j < measured.length; j++) {
        const a = measured[i], b = measured[j];
        if (!a.metric.seriesId || a.metric.seriesId !== b.metric.seriesId) continue;
        if (a.metric.period !== b.metric.period) continue;
        if (!near(a.metric.value, b.metric.value)) push('contradiction.value_mismatch', a.id + ' ' + a.metric.value + ' vs ' + b.id + ' ' + b.metric.value, a.id);
        const aUp = UP_RE.test(a.text), aDown = DOWN_RE.test(a.text);
        const bUp = UP_RE.test(b.text), bDown = DOWN_RE.test(b.text);
        if ((aUp && bDown) || (aDown && bUp)) push('contradiction.direction_flip', a.id + ' vs ' + b.id, a.id);
      }
    }

    return verdict(out);
  }

  function verdict(list) {
    const errors = list.filter((e) => e.severity === 'error');
    const warnings = list.filter((e) => e.severity !== 'error');
    return { status: errors.length ? 'repairable' : 'passed', errors, warnings };
  }

  /** What the ONE repair call is told. Codes and ids — never the whole previous answer. */
  function repairBrief(audit) {
    const rows = (audit && audit.errors ? audit.errors : []).slice(0, 20)
      .map((e) => '- ' + e.code + (e.claimId ? (' [' + e.claimId + ']') : '') + ': ' + e.detail);
    return 'Your previous structured answer failed IntMap\'s answer audit. Fix EXACTLY these findings and return the whole object again in the same schema. '
      + 'Do not argue with a finding — either correct the claim, split it, add the missing metric field, cite a different evidence id, or DELETE the statement and record the gap in limitations. '
      + 'Remember: no URLs, evidence only by id, one series per claim, dimension always stated, and the opening sentence may not outrun the body.\n\n[AUDIT FINDINGS]\n' + rows.join('\n');
  }

  /* ══ DEGRADE ═════════════════════════════════════════════════════════════════════════════════════
     ⚠ WHEN THE SECOND ATTEMPT ALSO FAILS, THE UNVERIFIED PROSE IS NOT SHOWN. The answer is rebuilt by
     CODE from the parts that passed: claims with no error survive, a block survives if at least one of
     its claims survives, and the opening sentence is replaced by a surviving primary claim when the
     original one is among the casualties. What was removed is stated, not hidden — 「エラー表示をすべて
     隠す」 is the failure mode this is the opposite of. */
  function degrade(env, audit) {
    const bad = new Set((audit && audit.errors ? audit.errors : []).map((e) => e.claimId).filter(Boolean));
    const leadFailed = (audit && audit.errors ? audit.errors : []).some((e) => /^(lead\.|schema\.empty_direct_answer|url\.)/.test(e.code));
    const kept = (env.claims || []).filter((c) => !bad.has(c.id));
    const keptIds = new Set(kept.map((c) => c.id));
    const sections = (env.answer.sections || []).map((s) => ({
      id: s.id,
      heading: s.heading,
      blocks: (s.blocks || []).filter((b) => (b.claimIds || []).some((id) => keptIds.has(id)))
        .map((b) => ({ type: b.type, text: b.text, claimIds: (b.claimIds || []).filter((id) => keptIds.has(id)) })),
    })).filter((s) => s.blocks.length);

    let leadText = env.answer.directAnswer.text;
    let leadIds = (env.answer.directAnswer.claimIds || []).filter((id) => keptIds.has(id));
    if (leadFailed || !leadIds.length) {
      const best = kept.find((c) => c.importance === 'primary') || kept.find((c) => c.importance === 'major') || kept[0];
      leadText = best ? best.text : '';
      leadIds = best ? [best.id] : [];
    }
    const removed = (env.claims || []).length - kept.length;
    return Object.assign({}, env, {
      answer: {
        directAnswer: { text: leadText, claimIds: leadIds },
        sections,
        limitations: (env.answer.limitations || []).slice(),
      },
      claims: kept,
      places: (env.places || []).filter((p) => !(p.claimIds || []).length || (p.claimIds || []).some((id) => keptIds.has(id))),
      audit: { status: 'degraded', errors: (audit && audit.errors) || [], warnings: (audit && audit.warnings) || [], removedClaims: removed },
    });
  }

    const API = { AUDIT_CODES, auditAnswer, degrade, repairBrief };
    try { window.IntMapAnswerAudit = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}