/* ============================================================================
 *  IntMap · ATLAS — SKILLS: FINDING THEM, READING THEM A SECTION AT A TIME, AND CHECKING THEM
 *  (atlas-skills)
 * ----------------------------------------------------------------------------
 *  js/atlas-skills-data.js declares the skills (prose, in en + jp). This file is everything that is
 *  DERIVED from them, so none of it is written twice:
 *
 *    searchSkills(query)        what find_capability appends to its answer: the few skills whose own
 *                               title / summary / keywords the request shares words with. Discovery is
 *                               the path capabilities already have — there is no second search tool.
 *    readSkill(id, section)     ONE section of ONE skill (the first when none is named), with the outline of
 *                               the rest and their sizes — what read_result does for a cut result: the model
 *                               takes the part it needs rather than the whole document.
 *    capabilityRefs(skill)      the capabilities a skill uses, read OUT OF ITS PROSE (`id` or `id{arg,arg}`
 *                               in backticks), so the list cannot disagree with the text.
 *    audit(caps, schemas)       the gate (npm run check:capabilities): every capability a skill names
 *                               exists and is not withdrawn, every argument it names is in that capability's
 *                               schema, both languages say the same references, every section is small.
 *
 *  ⚠ A SKILL IS A DOCUMENT. Nothing here runs a step, forces an order, refuses a call or counts anything:
 *  reading a skill changes no state and a turn that never reads one is exactly as it was
 *  (CONSTITUTION.md §5 — Atlas decides what it does; the harness only hands it material).
 * ==========================================================================*/

import { ATLAS_SKILLS } from './atlas-skills-data.js';

/* the character class that makes a request Japanese for this module: kana or CJK ideographs */
var JP_RE = /[぀-ヿ㐀-鿿]/;
/* `id` or `id{a,b}` — a capability id is namespace.name; the braces name arguments */
var REF_RE = /`([a-z][A-Za-z0-9]*\.[A-Za-z0-9]+)(?:\{([^}`]*)\})?`/g;
/* a section should be readable in one go; the number is the whole point of sectioning, and the gate holds it */
export var SECTION_MAX_CHARS = 1600;
/* the lowest score that counts as a match. OBSERVED: a Japanese keyword found whole in the request scores
   4 and a Latin keyword phrase scores 4; a single shared ordinary word scores 1, which must not be enough.
   EXPIRES WHEN: the skills grow past a few dozen and a word shared by two of them stops being rare —
   then rank by the rarity of the shared word (document frequency) rather than raising this number. */
var MIN_SCORE = 3;

export function langOf(text) { return JP_RE.test(String(text || '')) ? 'jp' : 'en'; }

function pick(v, lang) { return (v && (v[lang] || v.en)) || ''; }

export function listSkills() { return ATLAS_SKILLS; }
export function skillById(id) {
  var k = String(id || '').trim().toLowerCase();
  for (var i = 0; i < ATLAS_SKILLS.length; i++) if (ATLAS_SKILLS[i].id === k) return ATLAS_SKILLS[i];
  return null;
}

/* the capabilities (with the arguments named) one language's prose uses */
function refsIn(text) {
  var out = [], m; REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(String(text || '')))) {
    out.push({ id: m[1], args: m[2] ? m[2].split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [] });
  }
  return out;
}
export function capabilityRefs(skill, lang) {
  var seen = Object.create(null), out = [];
  (skill.sections || []).forEach(function (s) {
    refsIn(lang ? pick(s.body, lang) : pick(s.body, 'en') + '\n' + pick(s.body, 'jp')).forEach(function (r) {
      var e = seen[r.id];
      if (!e) { e = seen[r.id] = { id: r.id, args: [] }; out.push(e); }
      r.args.forEach(function (a) { if (e.args.indexOf(a) < 0) e.args.push(a); });
    });
  });
  return out;
}

/* ── search ─────────────────────────────────────────────────────────────────────────────────── */
function bigrams(s) {
  var t = String(s || '').replace(/[\s　、。・，．,.!?！？「」『』()（）]/g, ''), o = Object.create(null);
  for (var i = 0; i + 1 < t.length; i++) o[t.slice(i, i + 2)] = 1;
  return o;
}
var STOP = { what: 1, which: 1, with: 1, that: 1, this: 1, from: 1, have: 1, does: 1, where: 1, there: 1, about: 1, into: 1, between: 1, their: 1, show: 1, tell: 1, please: 1 };
function words(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && !STOP[w]; });
}

function scoreSkill(skill, query) {
  var q = String(query || '').toLowerCase(), score = 0;
  var kw = ((skill.keywords && skill.keywords.en) || []).concat((skill.keywords && skill.keywords.jp) || []);
  kw.forEach(function (k) { if (k && q.indexOf(String(k).toLowerCase()) >= 0) score += 4; });
  /* ordinary words shared with the English title / summary / keywords (each distinct word once) */
  var have = Object.create(null);
  words(pick(skill.title, 'en') + ' ' + pick(skill.summary, 'en') + ' ' + ((skill.keywords && skill.keywords.en) || []).join(' ')).forEach(function (w) { have[w] = 1; });
  var seen = Object.create(null);
  words(q).forEach(function (w) { if (have[w] && !seen[w]) { seen[w] = 1; score += 1; } });
  /* Japanese has no spaces: shared character pairs with the Japanese title / summary, three or more */
  if (JP_RE.test(q)) {
    var qb = bigrams(q), sb = bigrams(pick(skill.title, 'jp') + pick(skill.summary, 'jp')), n = 0;
    for (var b in qb) if (sb[b]) n++;
    if (n >= 3) score += Math.min(4, Math.floor(n / 2));
  }
  return score;
}

/* searchSkills(query, {want}) -> [{ id, title, summary, score, read }], best first, only real matches */
export function searchSkills(query, opts) {
  var want = (opts && opts.want) || 2, lang = langOf(query), out = [];
  ATLAS_SKILLS.forEach(function (s) {
    var sc = scoreSkill(s, query);
    if (sc >= MIN_SCORE) out.push({ skill: s, score: sc });
  });
  out.sort(function (a, b) { return b.score - a.score || (a.skill.id < b.skill.id ? -1 : 1); });
  return out.slice(0, want).map(function (x) {
    return { id: x.skill.id, title: pick(x.skill.title, lang), summary: pick(x.skill.summary, lang), score: x.score,
      read: 'find_capability {"query":"skill:' + x.skill.id + '"}' };
  });
}

/* ── read ───────────────────────────────────────────────────────────────────────────────────── */
function outline(skill, lang) {
  return (skill.sections || []).map(function (s) {
    return { id: s.id, title: pick(s.title, lang), chars: pick(s.body, lang).length };
  });
}

/* parseSkillQuery("skill:port-logistics-risk") -> "port-logistics-risk"; null when the query is not a skill read */
export function parseSkillQuery(query) {
  var m = /^\s*skill\s*:\s*([A-Za-z0-9_-]+)\s*$/i.exec(String(query || ''));
  return m ? m[1].toLowerCase() : null;
}

/* readSkill(id, {section, lang}) — one section, the outline, and what the skill uses. `lang` defaults to English. */
export function readSkill(id, opts) {
  opts = opts || {};
  var lang = opts.lang === 'jp' ? 'jp' : 'en';
  var skill = skillById(id);
  if (!skill) {
    return { ok: false, error: 'unknown_skill', message: 'There is no skill "' + String(id || '') + '".',
      skills: ATLAS_SKILLS.map(function (s) { return { id: s.id, title: pick(s.title, lang) }; }) };
  }
  var want = String(opts.section || '').trim().toLowerCase() || (skill.sections[0] && skill.sections[0].id);
  var sec = null;
  (skill.sections || []).forEach(function (s) { if (s.id === want) sec = s; });
  if (!sec) {
    return { ok: false, error: 'unknown_section', message: 'Skill "' + skill.id + '" has no section "' + want + '".',
      sections: outline(skill, lang) };
  }
  var rest = outline(skill, lang).filter(function (s) { return s.id !== sec.id; });
  return {
    ok: true, skill: skill.id, title: pick(skill.title, lang), language: lang,
    section: sec.id, sectionTitle: pick(sec.title, lang), text: pick(sec.body, lang),
    uses: capabilityRefs(skill, lang),
    otherSections: rest,
    note: 'A skill is reference material, not a procedure: take what helps, in any order, and keep to what the results of your own calls show. '
      + (rest.length ? 'Read another part with find_capability {"query":"skill:' + skill.id + '","section":"<id>"}. ' : '')
      + 'Capabilities named here are called with run_capability (get the exact schema from find_capability with the id).',
  };
}

/* ── the gate ───────────────────────────────────────────────────────────────────────────────── */
/* audit({ capabilities, schemas }) -> [failure strings]; empty means the skills are consistent with what exists */
export function audit(deps) {
  var caps = deps.capabilities, schemas = deps.schemas, bad = [];
  var ids = Object.create(null);
  ATLAS_SKILLS.forEach(function (s) {
    if (ids[s.id]) bad.push(s.id + ': declared twice');
    ids[s.id] = 1;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) bad.push(s.id + ': an id is lower-case words joined by hyphens');
    ['title', 'summary'].forEach(function (f) { ['en', 'jp'].forEach(function (l) { if (!(s[f] && s[f][l])) bad.push(s.id + ': ' + f + ' is missing in ' + l); }); });
    ['en', 'jp'].forEach(function (l) { if (!((s.keywords && s.keywords[l]) || []).length) bad.push(s.id + ': no keywords in ' + l); });
    var secIds = Object.create(null);
    (s.sections || []).forEach(function (sec) {
      if (secIds[sec.id]) bad.push(s.id + '/' + sec.id + ': section declared twice');
      secIds[sec.id] = 1;
      ['en', 'jp'].forEach(function (l) {
        var body = sec.body && sec.body[l];
        if (!body || !String(body).trim()) { bad.push(s.id + '/' + sec.id + ': no ' + l + ' text'); return; }
        if (body.length > SECTION_MAX_CHARS) bad.push(s.id + '/' + sec.id + ': ' + l + ' is ' + body.length + ' characters; a section is read whole, keep it under ' + SECTION_MAX_CHARS);
        if (!(sec.title && sec.title[l])) bad.push(s.id + '/' + sec.id + ': no ' + l + ' title');
      });
    });
    if (!s.sections || !s.sections.length) bad.push(s.id + ': no sections');
    /* the two languages must name the same capabilities and arguments — a reader of one must not be sent elsewhere */
    var en = capabilityRefs(s, 'en'), jp = capabilityRefs(s, 'jp');
    var key = function (r) { return r.id + '{' + r.args.slice().sort().join(',') + '}'; };
    var ek = en.map(key).sort().join(' '), jk = jp.map(key).sort().join(' ');
    if (ek !== jk) bad.push(s.id + ': the English and Japanese texts name different capabilities or arguments (en: ' + ek + ' / jp: ' + jk + ')');
    if (!en.length) bad.push(s.id + ': names no capability — a skill with nothing to reach for is not a skill about this product');
    /* every reference is real */
    capabilityRefs(s).forEach(function (r) {
      var cap = null;
      try { cap = caps.resolve(r.id); } catch (_) { cap = null; }
      if (!cap || cap.id !== r.id) { bad.push(s.id + ': `' + r.id + '` is not a capability id'); return; }
      if (cap.withdrawn) { bad.push(s.id + ': `' + r.id + '` is withdrawn'); return; }
      if (!r.args.length) return;
      var sch = null;
      try { sch = schemas && schemas.schemaFor ? schemas.schemaFor(r.id) : null; } catch (_) { sch = null; }
      var props = (sch && sch.properties) || {};
      r.args.forEach(function (a) { if (!(a in props)) bad.push(s.id + ': `' + r.id + '` has no argument "' + a + '" (its schema has ' + Object.keys(props).join(', ') + ')'); });
    });
  });
  if (!ATLAS_SKILLS.length) bad.push('there are no skills');
  return bad;
}
