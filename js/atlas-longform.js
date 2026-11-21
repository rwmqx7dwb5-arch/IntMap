/* ============================================================================
 *  IntMap · LONG-FORM WRITING — chapter by chapter, kept as it goes, joined at the end
 * ----------------------------------------------------------------------------
 *  A task's output is bounded (ai-proxy tasks/spec.ts: 500–3,400 tokens, 5,000 absolute), and one
 *  Atlas turn is bounded by the tool clock (js/atlas-agent.js `toolTimeoutMs`). A long report or
 *  a long source file written as ONE answer meets both walls; the audit of 2026-11-21 §9.6 named
 *  it. Raising the ceilings only moves the wall — a document longer than the new number still
 *  dies, and a cost guard that exists for a reason is weakened for every other task.
 *
 *  WHAT THIS DOES INSTEAD is the shape a person uses for a long document: an outline, then each
 *  chapter on its own with the outline and the end of the previous chapter in front of it, each
 *  chapter SAVED the moment it exists, and the chapters joined at the end.
 *    · a chapter the model cut off (meta.incompleteReason) is CONTINUED from where it stopped,
 *      up to `maxContinues` times, so one chapter is not limited to one output either;
 *    · what is saved is keyed by the OUTLINE (`outlineKey`), so asking again for the same outline
 *      does not write a finished chapter again: «already done» is said, not re-run (the rule in
 *      .agents/rules/one-pass-or-a-reason.md), and a turn that was cut, a tab that was closed, or
 *      a call that spent its time budget all resume from the last saved chapter;
 *    · a call writes chapters until its own time budget (`budgetMs`) is spent and then says how
 *      many are left — the budget sits UNDER the tool clock, so the loop is never told «did not
 *      finish» about work that was in fact being kept.
 *
 *  This file holds no model and no page: `ask` and the store are handed in (a test passes fakes;
 *  js/atlas-cap-research.js passes the page's). It is what research.longform runs.
 * ==========================================================================*/

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

/* planOutline(arg) → { ok, title, brief, format, sections[] } | { ok:false, why }
   Sections are the caller's: how many, in what order, and what each must contain is Atlas's call. The only
   things refused are the ones that cannot run — no sections, or a section with nothing to write about. */
export function planOutline(arg) {
  const a = arg && typeof arg === 'object' ? arg : {};
  const raw = Array.isArray(a.sections) ? a.sections : [];
  if (!raw.length) return { ok: false, why: 'sections was empty — give at least one {title, goal}' };
  const seen = new Set();
  const sections = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const o = typeof r === 'string' ? { title: r, goal: r } : (r && typeof r === 'object' ? r : {});
    const title = clip(o.title || o.goal, 160).trim();
    const goal = clip(o.goal || o.title, 1200).trim();
    if (!title || !goal) return { ok: false, why: 'section ' + (i + 1) + ' has no title or goal' };
    let id = clip(o.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || ('s' + (i + 1));
    while (seen.has(id)) id += '_';
    seen.add(id);
    const w = Number(o.words);
    sections.push({ id, title, goal, words: Number.isFinite(w) && w > 0 ? Math.min(6000, Math.round(w)) : undefined });
  }
  return { ok: true, title: clip(a.title, 200).trim(), brief: clip(a.brief, 4000).trim(), format: a.format === 'code' ? 'code' : 'prose', sections };
}

/* outlineKey(plan) → the same string for the same outline, a different one for any other (two 32-bit hashes in hex —
   an identity, not a secret) */
function outlineKey(plan) {
  const text = JSON.stringify([plan.title, plan.brief, plan.format, plan.sections.map((s) => [s.id, s.title, s.goal, s.words || 0])]);
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x5bd1e995) >>> 0; h2 ^= h2 >>> 15;
  }
  return 'lf' + h1.toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

const LONGFORM_SYSTEM = 'You write ONE section of a longer document that is written section by section. '
  + 'Write only that section, complete, in the language of the request, as Markdown (or as the code the request asks for). '
  + 'Do not repeat earlier sections, do not summarise the whole document, do not write an introduction to the document unless this section IS the introduction, '
  + 'and do not write later sections. Continue the document\'s voice, terms and numbering. State only what you can support; where you cannot, say so in the text.';

function sectionPrompt(plan, idx, prior, continuing) {
  const s = plan.sections[idx];
  let p = (plan.title ? 'DOCUMENT: ' + plan.title + '\n' : '') + (plan.brief ? 'WHAT THE DOCUMENT IS FOR:\n' + plan.brief + '\n' : '')
    + (plan.format === 'code' ? 'THE DOCUMENT IS SOURCE CODE: write this part as code, in the language the brief names, with no prose around it unless it is a comment.\n' : '')
    + '\nOUTLINE (you are writing section ' + (idx + 1) + ' of ' + plan.sections.length + '):\n'
    + plan.sections.map((x, i) => (i === idx ? '>> ' : '   ') + (i + 1) + '. ' + x.title).join('\n');
  if (prior) p += '\n\nTHE END OF THE PREVIOUS SECTION (so this one continues it, not repeats it):\n' + prior;
  p += '\n\nWRITE THIS SECTION — ' + s.title + ':\n' + s.goal + (s.words ? '\n(About ' + s.words + ' words.)' : '');
  if (continuing) p += '\n\nYOU HAVE WRITTEN THIS SECTION SO FAR (it was cut off by the length limit):\n' + continuing.slice(-3000) + '\n\nCONTINUE from exactly where it stops. Do not repeat what is above; write only what comes next.';
  return p;
}

/* runLongform({ plan, ask, store?, now?, budgetMs?, maxContinues?, signal?, onProgress? })
     ask(prompt, system, null, {task:'atlas_section', …}) → envelope { text, meta }   (js/ai-core.js askAIJSONEnvelope)
     store { read(key) → {chapters}|null, write(key, {chapters}) } — where finished chapters are kept
   → { key, state: 'done'|'partial'|'failed', chapters[{id,title,text,chars,state,continues,resumed}], remaining, wrote, resumed, costUsd, code? } */
export async function runLongform(o) {
  const plan = o.plan;
  const ask = o.ask;
  const store = o.store || null;
  const now = o.now || (() => Date.now());
  const budgetMs = Number.isFinite(o.budgetMs) && o.budgetMs > 0 ? o.budgetMs : 150000;
  const maxContinues = Number.isInteger(o.maxContinues) && o.maxContinues >= 0 ? o.maxContinues : 3;
  const key = outlineKey(plan);
  const t0 = now();
  let saved = {};
  try { const rec = store && store.read(key); if (rec && rec.chapters && typeof rec.chapters === 'object') saved = rec.chapters; } catch (_) { saved = {}; }
  const chapters = [];
  let wrote = 0, resumed = 0, costUsd = 0, code = '', spent = false;
  for (let i = 0; i < plan.sections.length; i++) {
    const s = plan.sections[i];
    const have = saved[s.id];
    if (have && typeof have.text === 'string' && have.text.trim() && have.complete !== false) {
      resumed++;
      chapters.push({ id: s.id, title: s.title, text: have.text, chars: have.text.length, state: 'done', continues: have.continues || 0, resumed: true });
      continue;
    }
    if (spent || (o.signal && o.signal.aborted) || (wrote > 0 && now() - t0 >= budgetMs)) { spent = true; chapters.push({ id: s.id, title: s.title, text: '', chars: 0, state: 'pending' }); continue; }
    const prior = chapters.length && chapters[chapters.length - 1].text ? chapters[chapters.length - 1].text.slice(-1200) : '';
    /* a chapter saved while still cut is CONTINUED from its saved text, not written again from the top */
    let text = have && typeof have.text === 'string' && have.complete === false ? have.text : '';
    let continues = text ? (have.continues || 0) : 0, complete = true, failed = '';
    for (let step = text ? 1 : 0; step <= maxContinues + (text ? continues : 0); step++) {
      /* the time budget binds the CONTINUATIONS too: a chapter that has spent it is kept cut and picked up by the next call */
      if (step > 0 && now() - t0 >= budgetMs) { complete = false; break; }
      let env;
      try {
        env = await ask(sectionPrompt(plan, i, prior, step ? text : ''), LONGFORM_SYSTEM, null, { task: 'atlas_section', webMode: 'auto', signal: o.signal });
      } catch (e) { failed = String((e && e.code) || (e && e.name) || 'error'); break; }
      const m = (env && env.meta) || {};
      costUsd += Math.max(0, Number(m.costUsd) || 0);
      const part = String((env && env.text) || '');
      text += part;
      if (!m.incompleteReason) { complete = true; break; }
      complete = false; continues = Math.max(continues, step + 1);
    }
    if (failed && !text.trim()) { code = failed; chapters.push({ id: s.id, title: s.title, text: '', chars: 0, state: 'failed', code: failed }); spent = true; continue; }
    /* what was written is kept even when the last piece was still cut: the reader gets it, and it is said to be cut */
    wrote++;
    saved[s.id] = { text, complete, continues, at: now() };
    try { if (store) store.write(key, { chapters: saved, at: now() }); } catch (_) { /* a store that cannot keep is not a reason to lose the text */ }
    chapters.push({ id: s.id, title: s.title, text, chars: text.length, state: complete ? 'done' : 'cut', continues });
    if (typeof o.onProgress === 'function') { try { o.onProgress({ done: chapters.filter((c) => c.state === 'done' || c.state === 'cut').length, total: plan.sections.length, id: s.id }); } catch (_) { /* observer */ } }
  }
  const remaining = chapters.filter((c) => c.state === 'pending' || c.state === 'failed').length;
  const state = remaining === 0 ? 'done' : (chapters.some((c) => c.text) ? 'partial' : 'failed');
  return { key, state, chapters, remaining, wrote, resumed, costUsd, code: code || undefined };
}

/* assemble(plan, chapters) → the whole document as Markdown (or code, joined with a blank line) — only chapters that exist, in outline order */
export function assemble(plan, chapters) {
  const parts = chapters.filter((c) => c.text && c.text.trim());
  if (plan.format === 'code') return parts.map((c) => c.text.replace(/^\s*```[a-z0-9+-]*\n?/i, '').replace(/\n?```\s*$/, '')).join('\n\n');
  const head = plan.title ? '# ' + plan.title + '\n\n' : '';
  return head + parts.map((c) => (/^\s*#{1,6}\s/.test(c.text) ? '' : '## ' + c.title + '\n\n') + c.text.trim()).join('\n\n');
}

/* a store over one Storage-like object (window.localStorage): the same outline finds its chapters again after a reload.
   Failure to read or write is the store's to swallow: the document is still returned, it is only not resumable. */
export function storageStore(storage, prefix) {
  const k = (key) => (prefix || 'intmap.longform.') + key;
  return {
    read(key) { try { const r = storage && storage.getItem(k(key)); return r ? JSON.parse(r) : null; } catch (_) { return null; } },
    write(key, rec) { try { if (storage) storage.setItem(k(key), JSON.stringify(rec)); } catch (_) { /* quota or private mode */ } },
  };
}
