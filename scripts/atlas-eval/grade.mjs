/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — IS THE ANSWER RIGHT?  (pure: no browser, no network, no clock)
 * ----------------------------------------------------------------------------
 *  scripts/atlas-eval/judge.mjs judges what a turn DID — the capability it reached, how many times it
 *  made the same call, whether it was cut short. Not one of its rules asks whether the sentence the
 *  reader received is TRUE: a turn that reached routing.route and wrote 「約 2 時間、900 km」 passed.
 *  This file is that missing half, in two instruments that answer different questions:
 *
 *    1. gradeAnswer(answer, reply) — DETERMINISTIC. The answer key (scripts/atlas-eval/answer-key.json)
 *       holds a verified value with the source it was verified at; this reads the quantities, dates
 *       and names the reply actually states and says whether one of them is the answer, within the
 *       tolerance the key declares. It runs in CI on every PR (no model, no money).
 *
 *    2. rubricRequest / readRubric — the INDEPENDENT GRADER. A second model, chosen by the server so
 *       that it is never the model that answered (supabase/functions/ai-proxy `atlas_grade`), scores
 *       the reply against the same answer and the rubric below. It costs a model call, so it runs
 *       only in the nightly production evaluation, and it lands in the cost ledger like every call.
 *
 *  ⚠ THE TWO ARE NOT REDUNDANT. The deterministic grade can only say 「the right number is in there」:
 *    a reply that lists five numbers, one of them right, passes it. The rubric reads the reply as a
 *    reader does — did it commit to the answer, did it say where the figure came from, is it in the
 *    reader's language. Neither replaces the other, and a disagreement between them is reported.
 *
 *  ⚠ 「NOT STATED」 IS NOT 「WRONG」. A reply that states no quantity of the asked kind is `absent`; one
 *    that states some and none matches is `incorrect`. Both fail, and the report counts them apart —
 *    「Atlas answered and was wrong」 and 「Atlas did not answer」 are different defects with different
 *    causes (the second is usually a turn that was cut short or never reached its tool).
 * ==========================================================================*/

/* The rubric's machine shape is shared with ai-proxy, which OWNS it (the server forces the grader to
   this schema — a client cannot widen it). One file, two readers: Deno imports it in the function,
   node imports it here. */
import { ATLAS_GRADE_SCHEMA, ATLAS_GRADE_CRITERIA } from '../../supabase/functions/_shared/atlas-grade-schema.js';
export { ATLAS_GRADE_SCHEMA, ATLAS_GRADE_CRITERIA };
/* (atlas-eval-map-state) the map axis — a row's `mapState` is checked against the vocabulary the product
   actually has (layer declarations, registered snapshot sections, the historical enumeration) */
import { mapVocabulary, validateMapState } from './map-state.mjs';

const str = (v) => (v == null ? '' : String(v));

/* ── reading numbers the way the replies write them ───────────────────────────────────────────────
   Measured shapes (the R775 / R802 transcripts and the answer key's own sources): 「515.4 km」,
   「約 2 時間 22 分」, 「1億2614万6099人」, 「1,404万人」, 「14.05 million people」, 「3,776 m」,
   「377,975 km²」, 「2h 22m」, 「twenty」 is NOT read (a number written out in words is rare in these
   replies, and reading it would add a vocabulary per language — the miss is counted as `absent`,
   never as `incorrect`). */
const UNIT_OF = [
  /* order matters: the longer spelling first (km² before km, 平方キロメートル before キロメートル) */
  ['km2', /^(?:km²|km\^?2|sq\.?\s*km|square\s+kilomet(?:er|re)s?|平方キロメートル|平方キロ|平方km|㎢)/i],
  ['mi2', /^(?:sq\.?\s*mi(?:les?)?\b|square\s+miles?|mi²|mi2)/i],
  ['mi', /^(?:miles?\b|mi\b|マイル)/i],
  ['ft', /^(?:feet\b|foot\b|ft\b|フィート)/i],
  ['km', /^(?:km|kilomet(?:er|re)s?|キロメートル|キロ|㌔|㎞)/i],
  ['m', /^(?:m(?![a-z²])|met(?:er|re)s?(?!\s*(?:per|\/))|メートル|ｍ)/i],
  ['people', /^(?:people|persons?|inhabitants|residents|population|人(?!口密度)|名)/i],
  ['minutes', /^(?:minutes?|mins?\b|分(?!の))/i],
  ['hours', /^(?:hours?|hrs?\b|h(?![a-z])|時間)/i],
];
const MULT = [
  [/^(?:billion|bn)\b/i, 1e9], [/^(?:million|mn)\b/i, 1e6], [/^thousand\b/i, 1e3],
];

/** NFKC folds full-width digits and units (１２３ → 123, ｋｍ → km); the thousands separators a
 *  reply uses (「,」「，」, a thin or ordinary space between groups of three) come off. */
function norm(text) {
  return str(text).normalize('NFKC').replace(/(\d)[,，](?=\d{3}(?:\D|$))/g, '$1').replace(/(\d)[  ](?=\d{3}(?:\D|$))/g, '$1');
}

/**
 * quantities(text) → [{ value, unit, raw }] — every number in the reply with the unit written after
 * it (unit null when none). Japanese compound numbers (「1億2614万6099」) are read as one value; a
 * duration written as hours and minutes (「2 時間 22 分」「2h 22m」) as one value in minutes.
 */
export function quantities(text) {
  const s = norm(text);
  const out = [];
  const NUM = /\d+(?:\.\d+)?/g;
  const KANJI = { '億': 1e8, '万': 1e4, '千': 1e3 };
  let m;
  while ((m = NUM.exec(s))) {
    const start = m.index;
    let i = start, value = 0, compound = false;
    /* a Japanese compound: groups of digits each followed by its multiplier (1億2614万6099), the last
       group possibly bare. Contiguous only — 「2026年」 then 「3,776 m」 are two numbers, not one. */
    for (;;) {
      const g = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (!g) break;
      const k = s.charAt(i + g[0].length);
      if (KANJI[k]) { value += +g[0] * KANJI[k]; i += g[0].length + 1; compound = true; continue; }
      if (!compound || !/^\d+$/.test(g[0])) { if (!compound) { value = +g[0]; i += g[0].length; } break; }
      value += +g[0]; i += g[0].length; break;   /* the bare tail of a compound */
    }
    /* an English multiplier: 14.05 million */
    if (!compound) {
      const rest = s.slice(i).replace(/^\s+/, '');
      for (const [re, f] of MULT) {
        const k = re.exec(rest);
        if (k) { value *= f; i = s.length - rest.length + k[0].length; compound = true; break; }
      }
    }
    /* the unit */
    const after = s.slice(i).replace(/^\s*/, '');
    let unit = null, ulen = 0;
    for (const [u, re] of UNIT_OF) { const k = re.exec(after); if (k) { unit = u; ulen = k[0].length; break; } }
    let end = s.length - after.length + ulen;
    /* hours followed by minutes is one duration */
    if (unit === 'hours') {
      const tail = /^\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?\b|m(?![a-z])|分)/i.exec(s.slice(end));
      if (tail) { value = value * 60 + (+tail[1]); end += tail[0].length; }
      else value = value * 60;
      unit = 'minutes';
    }
    /* below sea level: 「−86 m」「-86 m」「マイナス86m」「海面下86m」「86 m below sea level」. A minus
       between two digits is a range (「515-552 km」), not a sign. */
    const before = s.slice(Math.max(0, start - 4), start);
    if ((/[-−‐]$/.test(before) && !/\d\s*[-−‐]$/.test(before)) || /(?:マイナス|海面下|海抜下)\s*$/.test(s.slice(Math.max(0, start - 6), start))
      || /^\s*(?:below sea level|bsl\b)/i.test(s.slice(end))) value = -Math.abs(value);
    /* a population written 「1億2615万」 with no 人 is still a head count when it is that large */
    if (!unit && compound && value >= 1e4) unit = 'people?';
    out.push({ value, unit, raw: s.slice(start, end).trim() });
    NUM.lastIndex = Math.max(NUM.lastIndex, end);
  }
  return out;
}

/** The dimension each answer unit accepts, with the factor that converts a stated value into it. */
const ACCEPTS = {
  /* a reply in imperial units is not wrong — USGS states Denali in feet first — so it is converted,
     by the international definitions (1 mi = 1609.344 m, 1 ft = 0.3048 m) */
  km: { km: 1, m: 1e-3, mi: 1.609344 },
  m: { m: 1, km: 1e3, ft: 0.3048 },
  km2: { km2: 1, mi2: 2.589988110336 },
  people: { people: 1, 'people?': 1 },
  minutes: { minutes: 1 },
};

function within(v, a) {
  const t = a.tolerance || {};
  if (a.kind === 'range') return v >= a.min && v <= a.max;
  if (t.abs != null) return Math.abs(v - a.value) <= t.abs;
  const rel = t.rel != null ? t.rel : 0;
  return Math.abs(v - a.value) <= Math.abs(a.value) * rel + 1e-9;
}

/* ── dates ─────────────────────────────────────────────────────────────────────────────────────── */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
/** dates(text) → ['YYYY-MM-DD' | 'YYYY-MM' | 'YYYY'] — every date the reply writes, at the precision it writes it. */
export function dates(text) {
  const s = norm(text);
  const out = new Set();
  let m;
  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(s))) out.add(m[1] + '-' + pad(m[2]) + '-' + pad(m[3]));
  const ja = /(\d{4})\s*年\s*(?:(\d{1,2})\s*月\s*(?:(\d{1,2})\s*日)?)?/g;
  while ((m = ja.exec(s))) out.add(m[1] + (m[2] ? '-' + pad(m[2]) + (m[3] ? '-' + pad(m[3]) : '') : ''));
  const mdy = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
  while ((m = mdy.exec(s))) out.add(m[3] + '-' + pad(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1) + '-' + pad(m[2]));
  const dmy = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
  while ((m = dmy.exec(s))) out.add(m[3] + '-' + pad(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1) + '-' + pad(m[1]));
  const my = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi;
  while ((m = my.exec(s))) out.add(m[2] + '-' + pad(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1));
  const yr = /(?<![\d-])(1\d{3}|20\d{2})(?![\d])/g;
  while ((m = yr.exec(s))) out.add(m[1]);
  return [...out];
}

const fold = (s) => norm(s).toLowerCase().replace(/[\s　・·.\-'’]/g, '');

/**
 * gradeAnswer(answer, reply) → { verdict: 'correct'|'incorrect'|'absent', expected, stated:[…] }
 *   answer  one row's `answer` from answer-key.json
 *   reply   the text the reader received
 * `stated` is what the reply said of the asked kind — the evidence for the verdict, printed by the report.
 */
export function gradeAnswer(answer, reply) {
  const a = answer || {};
  const text = str(reply);
  if (!text.trim()) return { verdict: 'absent', expected: describe(a), stated: [] };
  if (a.kind === 'number' || a.kind === 'range') {
    const acc = ACCEPTS[a.unit] || {};
    /* a head count is often written BEFORE its noun (「the population was 331,449,281」), so for a
       population answer a bare number counts too — from 10,000 up, which leaves out every year */
    const bareCount = (q) => a.unit === 'people' && q.unit === null && q.value >= 1e4;
    const stated = quantities(text).filter((q) => (q.unit && acc[q.unit] != null) || bareCount(q))
      .map((q) => ({ value: q.value * (acc[q.unit] != null ? acc[q.unit] : 1), raw: q.raw }));
    if (!stated.length) return { verdict: 'absent', expected: describe(a), stated: [] };
    return { verdict: stated.some((q) => within(q.value, a)) ? 'correct' : 'incorrect', expected: describe(a), stated: stated.map((q) => q.raw) };
  }
  if (a.kind === 'count') {
    const stated = quantities(text).filter((q) => Number.isInteger(q.value) && q.value < 1e6);
    if (!stated.length) return { verdict: 'absent', expected: describe(a), stated: [] };
    return { verdict: stated.some((q) => q.value === a.value) ? 'correct' : 'incorrect', expected: describe(a), stated: stated.map((q) => q.raw) };
  }
  if (a.kind === 'date') {
    const want = str(a.value);
    const all = dates(text);
    const stated = all.filter((d) => d.length >= want.length);
    if (!stated.length) return { verdict: all.length ? 'incorrect' : 'absent', expected: want, stated: all };
    return { verdict: stated.some((d) => d.slice(0, want.length) === want) ? 'correct' : 'incorrect', expected: want, stated };
  }
  if (a.kind === 'name') {
    const t = fold(text);
    const hit = (a.accept || []).find((n) => t.indexOf(fold(n)) >= 0);
    return { verdict: hit ? 'correct' : 'absent', expected: (a.accept || []).join(' / '), stated: hit ? [hit] : [] };
  }
  return { verdict: 'absent', expected: '(unknown answer kind ' + a.kind + ')', stated: [] };
}

function describe(a) {
  if (a.kind === 'range') return a.min + '–' + a.max + ' ' + a.unit;
  if (a.kind === 'number') return a.value + ' ' + a.unit + (a.tolerance ? (a.tolerance.abs != null ? ' ± ' + a.tolerance.abs : ' ± ' + Math.round(a.tolerance.rel * 1000) / 10 + '%') : '');
  if (a.kind === 'count') return String(a.value);
  return '';
}

/** languageOf(text) → 'jp' | 'en' | '' — the language a reply is written in, by script, in the
 *  product's own codes. A reply in the other language is a rubric failure the model can be argued
 *  out of; this is the deterministic half of it. */
export function languageOf(text) {
  const s = str(text);
  const kana = (s.match(/[぀-ヿ]/g) || []).length;
  const han = (s.match(/[一-鿿]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (!s.trim()) return '';
  /* kana is Japanese and nothing else; units and place names in Latin letters are common inside a
     Japanese sentence (「約900 kmです」), and a kanji place name inside an English one (「Tokyo (東京)」) */
  if (kana && (kana + han) * 4 >= latin) return 'jp';
  if (!kana && han >= 4 && han * 4 >= latin) return 'jp';
  return latin ? 'en' : '';
}

/* ── the rubric: what the independent grader is asked ─────────────────────────────────────────── */

/**
 * rubricRequest(q, reply) → { system, prompt } — the request body's text for ai-proxy `atlas_grade`.
 * The grader is given the VERIFIED answer and its source, so it grades against the key rather than
 * against its own memory (a grader that knows less than the key would mark a right answer wrong).
 */
export function rubricRequest(q, reply) {
  const a = q.answer || {};
  const expected = a.kind === 'name' ? (a.accept || []).join(' / ') : a.kind === 'date' ? a.value : describe(a);
  const system = [
    'You grade one answer written by a map assistant ("Atlas") to a reader\'s question.',
    'You are given the question, the VERIFIED correct answer with the source it was verified at, and the assistant\'s reply.',
    'Grade the reply against the verified answer, not against your own memory. Score each criterion 0, 1 or 2:',
    ...ATLAS_GRADE_CRITERIA.map((c) => '- ' + c.id + ': ' + c.asks + ' (0 = ' + c.zero + '; 2 = ' + c.two + ')'),
    'Then give an overall verdict: "pass" only if correctness is 2 and no criterion is 0. Quote at most one short phrase of the reply as evidence.',
  ].join('\n');
  const prompt = [
    'QUESTION (' + (q.lang === 'jp' ? 'Japanese' : 'English') + '): ' + str(q.text),
    'VERIFIED ANSWER: ' + expected + (q.note ? ' — ' + q.note : ''),
    'SOURCE: ' + str(q.source && q.source.title) + ' — ' + str(q.source && q.source.url) + ' — ' + str(q.source && q.source.states),
    'REPLY:',
    str(reply).slice(0, 6000),
  ].join('\n');
  return { system, prompt };
}

/**
 * readRubric(data) → { measured:true, scores, verdict, evidence } | { measured:false, reason }
 * The grader's answer, checked against the schema it was forced to — a malformed grade is NOT a
 * failing grade, it is an ungraded turn (the same 「could not measure」 the judge keeps apart).
 */
export function readRubric(data) {
  const d = data && typeof data === 'object' ? data : null;
  if (!d) return { measured: false, reason: 'the grader returned no JSON' };
  const scores = {};
  for (const c of ATLAS_GRADE_CRITERIA) {
    const v = d.scores && d.scores[c.id];
    if (v !== 0 && v !== 1 && v !== 2) return { measured: false, reason: 'the grader gave no 0/1/2 score for ' + c.id };
    scores[c.id] = v;
  }
  const verdict = d.verdict === 'pass' || d.verdict === 'fail' ? d.verdict : null;
  if (!verdict) return { measured: false, reason: 'the grader gave no verdict' };
  /* the verdict the grader was told to derive, re-derived: a grader that says pass with correctness 1
     contradicts its own instructions, and the stricter reading is kept and said */
  const derived = scores.correctness === 2 && !Object.values(scores).some((v) => v === 0) ? 'pass' : 'fail';
  return { measured: true, scores, verdict: derived, graderSaid: verdict, evidence: str(d.evidence).slice(0, 300) };
}

/**
 * validateAnswerKey(key, capabilityExists, mapVocab) → [problem…] — the answer key's own schema. A row with no
 * source, an unknown unit or a capability the registry does not have would grade nothing or grade
 * against an unverifiable claim; the check names it instead. A row's `mapState` is checked against
 * `mapVocab` (scripts/atlas-eval/map-state.mjs mapVocabulary — discovered from this checkout when not given).
 */
export function validateAnswerKey(key, capabilityExists, mapVocab) {
  const bad = [];
  const ids = new Set();
  const KINDS = new Set(['number', 'range', 'date', 'name', 'count']);
  const UNITS = new Set(Object.keys(ACCEPTS));
  const CATS = new Set(['distance', 'duration', 'population', 'date', 'area', 'elevation', 'length', 'count', 'name']);
  for (const q of (key && key.questions) || []) {
    if (!q.id || ids.has(q.id)) bad.push('duplicate or missing id: ' + q.id); ids.add(q.id);
    if (q.lang !== 'en' && q.lang !== 'jp') bad.push(q.id + ': lang must be en or jp');
    if (!CATS.has(q.category)) bad.push(q.id + ': unknown category ' + q.category);
    if (!str(q.text).trim()) bad.push(q.id + ': no text');
    const a = q.answer || {};
    if (!KINDS.has(a.kind)) bad.push(q.id + ': unknown answer kind ' + a.kind);
    if ((a.kind === 'number' || a.kind === 'range') && !UNITS.has(a.unit)) bad.push(q.id + ': unknown unit ' + a.unit);
    if (a.kind === 'number' && (!Number.isFinite(a.value) || !a.tolerance || (a.tolerance.rel == null && a.tolerance.abs == null))) bad.push(q.id + ': a number needs a value and a tolerance');
    if (a.kind === 'range' && !(Number.isFinite(a.min) && Number.isFinite(a.max) && a.min <= a.max)) bad.push(q.id + ': a range needs min ≤ max');
    if (a.kind === 'date' && !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(str(a.value))) bad.push(q.id + ': a date is YYYY[-MM[-DD]]');
    if (a.kind === 'name' && !(Array.isArray(a.accept) && a.accept.length)) bad.push(q.id + ': a name needs accepted spellings');
    if (a.kind === 'count' && !Number.isInteger(a.value)) bad.push(q.id + ': a count is an integer');
    const s = q.source || {};
    if (!/^https?:\/\//.test(str(s.url)) || !str(s.title).trim() || !str(s.states).trim()) bad.push(q.id + ': every answer names the source it was verified at (title, url, what it states)');
    for (const c of q.capabilities || []) if (capabilityExists && !capabilityExists(c)) bad.push(q.id + ': names capability «' + c + '», which the registry does not have');
    if (q.mapState != null) bad.push(...validateMapState(q.mapState, mapVocab || mapVocabulary(), q.id));
  }
  return bad;
}
