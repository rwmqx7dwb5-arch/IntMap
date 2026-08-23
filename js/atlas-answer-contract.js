/* ============================================================================
 *  IntMap · ATLAS — THE ANSWER IS A CONTRACT, NOT A STRING  (#R347)
 * ----------------------------------------------------------------------------
 *  「もっともらしいが、結論・統計・引用・操作結果が十分に照合されていない回答」を、
 *   一件のプロンプト調整ではなく構造で防ぐ。
 *
 *  An analysis answer used to be one field: prose, with a `SOURCES:` line and a `PLACES:` JSON
 *  trailer glued to the end and peeled off again with two regular expressions. Everything the
 *  reported failure is made of follows from that shape, because none of it is REPRESENTED:
 *
 *    · the opening sentence and the body are the same field, so nothing can compare them — and the
 *      reported answer opened with «国内市場よりも製造業・投資・輸出» over a body whose own figures
 *      make consumption the largest component of both demand and growth;
 *    · «構成比», «成長寄与», «長期的な供給能力» are three different questions and one word
 *      («支えている») answered all three, because a string has no `dimension`;
 *    · 「工業付加価値」「規模以上工業の増加率」are different statistical series with different
 *      definitions, and a sentence can chain them because a string has no `seriesId`;
 *    · a URL in the prose is indistinguishable from a URL IntMap fetched.
 *
 *  This file is the shape that makes each of those a decidable question. It holds the schema the
 *  model is made to fill, the enumerations that give a number its meaning, the normaliser that
 *  turns whatever came back into that shape, and the tokeniser the audit uses to read the figures
 *  out of a claim's own sentence. It renders nothing and calls nothing — js/atlas-answer-audit.js
 *  judges it and js/atlas-answer-render.js draws it.
 *
 *  ⚠ THE ENUMERATIONS ARE THE POINT. `dimension` is not documentation: a claim that says
 *  «consumption is the largest» is TRUE of `share`, TRUE of `growth_contribution` and FALSE of
 *  `structural_capacity`, so a comparison between two claims is only meaningful when both name the
 *  same one. The audit refuses to compare across dimensions and refuses to let a claim leave it
 *  unspecified when it is the answer's lead.
 * ==========================================================================*/

export function makeAtlasAnswerContract() {
  return (function () {

  const CONTRACT_VERSION = 1;

  const CLAIM_TYPES = ['fact', 'calculation', 'inference', 'judgment'];
  const IMPORTANCE = ['primary', 'major', 'supporting'];
  /* ⚠ THE SIX MEANINGS OF 「支えている」. Each one is a different question about the same economy and
     the reported answer blended the first three into one sentence. */
  const DIMENSIONS = [
    'level',                 /* how big the activity is right now */
    'share',                 /* its portion of a total (of GDP, of exports, …) */
    'growth_contribution',   /* how many points of a period's growth it supplied */
    'structural_capacity',   /* the long-run capacity that makes the level possible */
    'trend',                 /* direction over time */
    'causal_driver',         /* a sustained cause */
    'other',
  ];
  const BASES = ['nominal', 'real', 'current_price', 'constant_price', 'percentage_point', 'other'];
  const CONFIDENCE = ['high', 'medium', 'low'];
  const TEMPORAL_MODES = ['current', 'historical', 'mixed', 'unspecified'];

  /* ── unit CLASSES ───────────────────────────────────────────────────────────────────────────────
     A percentage and a percentage POINT are written with the same glyph in half the world's prose and
     they are not the same quantity: 「消費が56.9%」 is a share and 「消費が2.6ポイント」 is a growth
     contribution. Everything numeric in the audit is decided on these classes, never on the raw
     spelling, so a fixture may say `percent_of_gdp` and a sentence may say `%` and they still meet. */
  const UNIT_CLASSES = ['percent', 'percentage_point', 'currency', 'magnitude', 'index', 'other'];

  const UNIT_CLASS_BY_TOKEN = [
    [/^(percentage[ _-]?points?|percent[ _-]?points?|pp|ポイント|процентных пунктов|puntos porcentuales|prozentpunkte)$/i, 'percentage_point'],
    [/^(%|％|percent|percentage|パーセント|percent_of_gdp|percent_yoy|percent_of_total|proc|процент|por ciento|prozent)$/i, 'percent'],
    [/^(兆元|億元|兆円|億円|兆ドル|億ドル|元|円|ドル|usd|cny|jpy|eur|rmb|yuan|dollars?|trillion_cny|billion_cny|trillion_usd|billion_usd|trillion_jpy)$/i, 'currency'],
    [/^(兆|億|万|千|trillion|billion|million|thousand)$/i, 'magnitude'],
    [/^(index|指数)$/i, 'index'],
  ];

  function unitClass(unit) {
    const u = String(unit == null ? '' : unit).trim();
    if (!u) return '';
    for (const [re, cls] of UNIT_CLASS_BY_TOKEN) if (re.test(u)) return cls;
    if (/percentage[ _-]?point/i.test(u)) return 'percentage_point';
    if (/percent|%|％/i.test(u)) return 'percent';
    if (/cny|usd|jpy|eur|元|円|ドル/i.test(u)) return 'currency';
    return 'other';
  }

  /* ⚠ ONE DELIMITED STRING, NOT AN ARRAY OF ADJACENT SLOTS. scripts/i18n-pair-audit.mjs reads an
     array whose neighbouring members look like translations of one another as a translation tuple
     held as data — the seventh shape #R251 went after — and these are not translations of anything.
     They are the SPELLINGS a unit may take inside a sentence, and every one of them must match in
     EVERY language at once: a Japanese answer still writes 「6.4%」 and an English one may write
     「2.6 percentage points」, so the reader's language cannot select a subset.
     Ordered longest-first so 「percentage points」 never matches as 「percent」 with a stray word after it. */
  const UNIT_SPELLINGS = 'percentage points|percentage point|percent points|percent point'
    + '|パーセントポイント|процентных пунктов|puntos porcentuales|Prozentpunkte|パーセント|ポイント'
    + '|percent|兆ドル|億ドル|兆元|億元|兆円|億円|trillion|billion|million'
    + '|USD|CNY|JPY|EUR|ドル|兆|億|万|元|円|pp|%|％';
  const UNIT_ALTERNATION = UNIT_SPELLINGS.split('|').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const NUM_TOKEN_RE = new RegExp('(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*(' + UNIT_ALTERNATION + ')?', 'gi');

  /**
   * numericTokens(text) — every figure a sentence actually states, with the class of its unit.
   * This is what makes 「二つの統計系列を一続きの数値として扱っている」 decidable: the audit reads the
   * figures out of the claim's own sentence and asks which recorded fact each one came from.
   */
  function numericTokens(text) {
    const s = String(text == null ? '' : text);
    const out = [];
    NUM_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = NUM_TOKEN_RE.exec(s))) {
      const raw = m[1];
      const v = Number(String(raw).replace(/,/g, ''));
      if (!isFinite(v)) continue;
      /* A bare year is a date, not a measurement — 「2025年」 must not be audited as an unsourced figure. */
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 2);
      const isYear = !m[2] && /^\d{4}$/.test(raw) && (/^(年|-|\/)/.test(after) || /(年|year)/i.test(s.slice(Math.max(0, m.index - 2), m.index + m[0].length + 4)));
      if (isYear) continue;
      out.push({ value: v, unit: m[2] || '', unitClass: unitClass(m[2] || ''), index: m.index });
      if (m[0].length === 0) NUM_TOKEN_RE.lastIndex++;
    }
    return out;
  }

  /* ══ THE PROVIDER SCHEMA ═════════════════════════════════════════════════════════════════════════
     Same dialect as the other structured tasks in this app (upper-case type names, `properties`,
     `required`) — MAP_REPORT_SCHEMA in supabase/functions/ai-proxy/index.ts and RESEARCH_MAP_SCHEMA
     in js/atlas-console.js. ⚠ It contains no url field anywhere, on purpose: the model has no place
     to put a URL, so it cannot supply one. */
  const ANSWER_SCHEMA = {
    type: 'OBJECT',
    properties: {
      directAnswer: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, claimIds: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['text', 'claimIds'],
      },
      sections: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            heading: { type: 'STRING' },
            blocks: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  type: { type: 'STRING' },
                  text: { type: 'STRING' },
                  claimIds: { type: 'ARRAY', items: { type: 'STRING' } },
                },
                required: ['type', 'text', 'claimIds'],
              },
            },
          },
          required: ['id', 'heading', 'blocks'],
        },
      },
      limitations: { type: 'ARRAY', items: { type: 'STRING' } },
      claims: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            text: { type: 'STRING' },
            claimType: { type: 'STRING' },
            importance: { type: 'STRING' },
            dimension: { type: 'STRING' },
            basedOn: { type: 'ARRAY', items: { type: 'STRING' } },
            metric: {
              type: 'OBJECT',
              properties: {
                seriesId: { type: 'STRING' }, concept: { type: 'STRING' },
                value: { type: 'NUMBER' }, unit: { type: 'STRING' }, basis: { type: 'STRING' },
                adjustment: { type: 'STRING' }, geography: { type: 'STRING' }, period: { type: 'STRING' },
              },
            },
            evidenceIds: { type: 'ARRAY', items: { type: 'STRING' } },
            confidence: { type: 'STRING' },
            qualifier: { type: 'STRING' },
          },
          required: ['id', 'text', 'claimType', 'importance', 'dimension', 'evidenceIds', 'confidence'],
        },
      },
      places: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' }, country: { type: 'STRING' }, kind: { type: 'STRING' },
            claimIds: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['name', 'country'],
        },
      },
    },
    required: ['directAnswer', 'sections', 'claims'],
  };

  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 4000);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const inSet = (v, set, dflt) => (set.indexOf(String(v || '')) >= 0 ? String(v) : dflt);

  function normMetric(m) {
    if (!m || typeof m !== 'object') return null;
    const v = Number(m.value);
    const out = {
      seriesId: str(m.seriesId, 80), concept: str(m.concept, 160),
      value: isFinite(v) ? v : null, unit: str(m.unit, 40),
      basis: str(m.basis, 40), adjustment: str(m.adjustment, 60),
      geography: str(m.geography, 80), period: str(m.period, 40),
    };
    const any = out.seriesId || out.concept || out.unit || out.period || out.value != null;
    return any ? out : null;
  }

  /**
   * normalizeAnswer(raw, opts) — whatever the model returned, in the shape the rest of the round
   * reads. It COERCES and it never invents: a field the model omitted stays empty so the audit can
   * report it, rather than being filled with a plausible default that would make the gap invisible.
   */
  function normalizeAnswer(raw, opts) {
    opts = opts || {};
    const src = (raw && typeof raw === 'object') ? raw : {};
    const da = (src.directAnswer && typeof src.directAnswer === 'object') ? src.directAnswer : {};
    return {
      version: CONTRACT_VERSION,
      request: {
        turnId: str(opts.turnId, 120), callId: str(opts.callId, 120),
        text: str(opts.text, 2000), language: str(opts.language, 20),
        temporalMode: inSet(opts.temporalMode, TEMPORAL_MODES, 'unspecified'),
        answerGoal: str(opts.answerGoal, 200),
        requestedOutputs: arr(opts.requestedOutputs).map((x) => str(x, 40)),
      },
      answer: {
        directAnswer: { text: str(da.text, 1200), claimIds: arr(da.claimIds).map((x) => str(x, 40)) },
        sections: arr(src.sections).map((s, i) => ({
          id: str((s && s.id) || ('s' + (i + 1)), 40),
          heading: str(s && s.heading, 160),
          blocks: arr(s && s.blocks).map((b) => ({
            type: inSet(b && b.type, ['paragraph', 'bullet_list'], 'paragraph'),
            text: str(b && b.text, 4000),
            claimIds: arr(b && b.claimIds).map((x) => str(x, 40)),
          })),
        })),
        limitations: arr(src.limitations).map((x) => str(x, 400)).filter(Boolean),
      },
      claims: arr(src.claims).map((c, i) => ({
        id: str((c && c.id) || ('c' + (i + 1)), 40),
        text: str(c && c.text, 1200),
        claimType: inSet(c && c.claimType, CLAIM_TYPES, 'fact'),
        importance: inSet(c && c.importance, IMPORTANCE, 'supporting'),
        dimension: inSet(c && c.dimension, DIMENSIONS, ''),
        basedOn: arr(c && c.basedOn).map((x) => str(x, 40)),
        metric: normMetric(c && c.metric),
        evidenceIds: arr(c && c.evidenceIds).map((x) => str(x, 40)),
        confidence: inSet(c && c.confidence, CONFIDENCE, 'low'),
        qualifier: str(c && c.qualifier, 200),
      })),
      places: arr(src.places).map((p) => ({
        name: str(p && p.name, 120), country: str(p && p.country, 90),
        kind: str(p && p.kind, 60), claimIds: arr(p && p.claimIds).map((x) => str(x, 40)),
      })).filter((p) => p.name),
      operations: [],
      audit: { status: 'pending', errors: [], warnings: [] },
    };
  }

  /** Every piece of text the reader will actually see. The URL and contradiction checks read this. */
  function renderedTexts(env) {
    const out = [];
    if (!env || !env.answer) return out;
    if (env.answer.directAnswer && env.answer.directAnswer.text) out.push({ where: 'directAnswer', text: env.answer.directAnswer.text });
    (env.answer.sections || []).forEach((s) => {
      if (s.heading) out.push({ where: 'heading:' + s.id, text: s.heading });
      (s.blocks || []).forEach((b, i) => { if (b.text) out.push({ where: 'block:' + s.id + ':' + i, text: b.text }); });
    });
    (env.answer.limitations || []).forEach((t, i) => out.push({ where: 'limitation:' + i, text: t }));
    return out;
  }

  /** Every claimId the rendered answer points at. A claim nobody points at is dead weight. */
  function referencedClaimIds(env) {
    const ids = new Set();
    if (!env || !env.answer) return ids;
    (env.answer.directAnswer.claimIds || []).forEach((id) => ids.add(id));
    (env.answer.sections || []).forEach((s) => (s.blocks || []).forEach((b) => (b.claimIds || []).forEach((id) => ids.add(id))));
    (env.places || []).forEach((p) => (p.claimIds || []).forEach((id) => ids.add(id)));
    return ids;
  }

  function claimById(env) {
    const m = new Map();
    ((env && env.claims) || []).forEach((c) => m.set(c.id, c));
    return m;
  }

  /* ══ WHAT THE MODEL IS TOLD ══════════════════════════════════════════════════════════════════════
     ⚠ THE TASK RULES LIVE HERE AND NOT IN js/atlas-persona.js. The persona is WHO Atlas is, for every
     surface; these are the rules of ONE task. #R267's lesson — 「同じ指示が3回来たら『似せた』のであって
     『1つにした』のではない」 — is why they are not copied into both. */
  function answerContractRules(ctx) {
    ctx = ctx || {};
    const lang = ctx.language || 'the user\'s language';
    return [
      'You return ONE JSON object in the given schema and NOTHING else. Prose belongs in the schema\'s text fields.',
      'EVERY sentence the reader will see lives in directAnswer.text, a section block\'s text, or limitations. Write them in ' + lang + '.',
      'CITATION: you may NOT write a URL, a domain name, or a source name anywhere. Reference evidence ONLY by the ids in the EVIDENCE RECORDS block. An id that is not in that block is a fabrication and the answer will be rejected.',
      'CLAIMS: every statement of substance is a claim with an id, and each block lists the claimIds it rests on. directAnswer must list at least one claim marked importance:"primary".',
      'DIMENSION IS MANDATORY AND IT IS THE MEANING OF THE CLAIM. "share" = a portion of a total. "growth_contribution" = how many percentage POINTS of a period\'s growth it supplied. "level" = the current size. "structural_capacity" = the long-run capacity that makes the level possible. "trend" = direction. "causal_driver" = a sustained cause. A question like "what actually supports this economy" has more than one correct answer because it has more than one dimension — answer the dimensions separately and say which is which. Never let one word carry two dimensions.',
      'NUMBERS: a claim that states a figure must carry metric{seriesId, concept, value, unit, basis, geography, period}. seriesId names the STATISTICAL SERIES the figure comes from, copied from the evidence record — never invented. Two figures from different series may not appear in the same claim: split them into two claims. Percentages and percentage points are different units; a growth contribution is measured in percentage points. Never chain a value-added level onto an industrial output growth rate, a nominal figure onto a real one, a share onto a contribution, or an annual figure onto a quarterly one.',
      'THE OPENING SENTENCE IS AUDITED HARDER THAN THE BODY. It must be supported by primary claims, it must name the dimension it is answering in, and it must not contradict any figure in the body. Do NOT open with an exclusive or comparative verdict ("A rather than B", "the main driver is", "in fact it is") unless you have measured claims for BOTH sides in the SAME dimension.',
      'INFERENCE IS NOT FACT. claimType "inference" or "judgment" must be worded as an assessment and must list the fact claims it rests on in basedOn.',
      'HONESTY: if the evidence cannot support something, put it in limitations instead of writing it. An answer that says less and is checkable is the required outcome.',
    ].join(' ');
  }

    const API = { ANSWER_SCHEMA, BASES, CLAIM_TYPES, CONFIDENCE, CONTRACT_VERSION, DIMENSIONS, IMPORTANCE, TEMPORAL_MODES, UNIT_CLASSES, answerContractRules, claimById, normalizeAnswer, numericTokens, referencedClaimIds, renderedTexts, unitClass };
    try { window.IntMapAnswerContract = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}