/* ============================================================================
 *  IntMap · the enquiries console's PIPELINE — where each conversation stands   (sales-next)
 * ----------------------------------------------------------------------------
 *  admin-inquiries.html answered one question per enquiry: was it ANSWERED (status). It could not answer
 *  the operator's next one — which organisations are we talking to, who is trying the map, what did I
 *  promise to do and by when — so that lived in the operator's head. This is that board, over the four
 *  columns 20261003210000_org_inquiry_pipeline.sql added (stage, next_step, next_step_on, stage_changed_at).
 *
 *  WHO LOADS IT: js/admin-inquiries.js, with `import()` the first time the Pipeline tab is opened (a classic
 *  script may import a module dynamically; nothing is published on window). It is copied into dist/ verbatim
 *  (vite.config.js STATIC_ASSETS), so it imports nothing.
 *  THE WORDS are not spelled here: the page carries them as data-* on <main>, written by scripts/org-pages.mjs
 *  from their one declaration (supabase/functions/_shared/inquiry-shape.js INQUIRY_PIPELINE). `wordsFrom(main)`
 *  reads them; a page without them gets no board (it says so) rather than a guessed list.
 *  WHO MAY WRITE is the database's decision (RLS: an admin only). English only, like admin.html.
 *
 *  `pipelineModel` is pure (tests/sales-next-checks.test.mjs evaluates it); `mountPipeline` draws it.
 * ==========================================================================*/

/** the words the page carries → { statuses, stages, closedStages, notLeadPurposes, notLeadStatuses, nextStepMax } or null */
export function wordsFrom(main) {
  const ds = (main && main.dataset) || {};
  const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const w = { statuses: list(ds.statuses), stages: list(ds.stages), closedStages: list(ds.closedStages),
    notLeadPurposes: list(ds.notLeadPurposes), notLeadStatuses: list(ds.notLeadStatuses), nextStepMax: +ds.nextStepMax || 0 };
  return w.stages.length && w.statuses.length && w.nextStepMax > 0 ? w : null;
}

const DAY = 86400000;
/** a calendar day as 'YYYY-MM-DD' in the operator's own time zone (a follow-up is due on THEIR day) */
export function localDay(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

/**
 * pipelineModel(rows, words, now) → {
 *   leads,                         rows that are conversations (not spam, not a supporter asking to be named)
 *   columns: { [stage]: rows },    by stage, oldest-due first, then newest
 *   due:     rows,                 open (not a closed stage) with next_step_on on or before today
 *   undated: rows,                 open, past the first stage, with no next step date — a conversation nobody owns
 *   byAudience: { [audience]: { [stage]: n } },
 *   unknownStage: rows             a stage the page does not declare (the table and the page disagree — said, not hidden)
 * }
 */
export function pipelineModel(rows, words, now) {
  const today = localDay(now || new Date());
  const isLead = (r) => !words.notLeadStatuses.includes(r.status) && !words.notLeadPurposes.includes(r.purpose);
  /* open = a declared stage that is not an end; a stage the page does not know is reported apart (unknownStage), not guessed open */
  const open = (r) => words.stages.includes(r.stage) && !words.closedStages.includes(r.stage);
  const leads = (rows || []).filter(isLead);
  const columns = {}; words.stages.forEach((s) => { columns[s] = []; });
  const unknownStage = [];
  const byAudience = {};
  for (const r of leads) {
    if (columns[r.stage]) columns[r.stage].push(r); else unknownStage.push(r);
    const a = byAudience[r.audience] || (byAudience[r.audience] = {});
    a[r.stage] = (a[r.stage] || 0) + 1;
  }
  const byDue = (a, b) => (a.next_step_on || '9999') < (b.next_step_on || '9999') ? -1 : (a.next_step_on || '9999') > (b.next_step_on || '9999') ? 1
    : String(b.created_at || '').localeCompare(String(a.created_at || ''));
  Object.keys(columns).forEach((s) => columns[s].sort(byDue));
  const due = leads.filter((r) => open(r) && r.next_step_on && r.next_step_on <= today).sort(byDue);
  const undated = leads.filter((r) => open(r) && r.stage !== words.stages[0] && !r.next_step_on);
  return { today, leads, columns, due, undated, byAudience, unknownStage };
}
/** whole days since an ISO instant (for «12 d» on a card) */
export function ageDays(iso, now) { const t = Date.parse(iso); return isFinite(t) ? Math.max(0, Math.floor(((now ? +now : Date.now()) - t) / DAY)) : null; }

/* ══ THE BOARD ═════════════════════════════════════════════════════════════════════════════════════════════ */
const COLS = 'id,created_at,audience,purpose,name,organization,email,status,stage,next_step,next_step_on,stage_changed_at';
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }

/**
 * mountPipeline(box, { sb, words, toast, openEnquiry }) → { reload() }
 *   sb           the console's Supabase client (signed in as an admin)
 *   openEnquiry  (row) → show the full enquiry in the console (its message, its triage)
 */
export function mountPipeline(box, ctx) {
  const words = ctx.words;
  async function reload() {
    box.textContent = ''; box.appendChild(el('p', 'empty', 'Loading…'));
    if (!words) { box.textContent = ''; box.appendChild(el('p', 'empty', 'This page carries no pipeline words (regenerate it with node scripts/org-pages.mjs --write).')); return; }
    let q = ctx.sb.from('org_inquiries').select(COLS).order('created_at', { ascending: false });
    if (words.notLeadStatuses.length) q = q.not('status', 'in', '(' + words.notLeadStatuses.join(',') + ')');
    if (words.notLeadPurposes.length) q = q.not('purpose', 'in', '(' + words.notLeadPurposes.join(',') + ')');
    const r = await q;
    box.textContent = '';
    if (r.error) { box.appendChild(el('p', 'empty', 'Could not read the pipeline: ' + r.error.message + (/stage/.test(r.error.message) ? ' — has 20261003210000_org_inquiry_pipeline.sql been applied?' : ''))); return; }
    draw(pipelineModel(r.data || [], words, new Date()));
  }
  function draw(m) {
    const head = el('div', 'card pipe-sum');
    const open = m.leads.filter((r) => !words.closedStages.includes(r.stage)).length;
    head.appendChild(el('h2', null, open + ' open conversation' + (open === 1 ? '' : 's') + ' · ' + m.due.length + ' follow-up' + (m.due.length === 1 ? '' : 's') + ' due'));
    /* the counts by who is writing × where it stands */
    const tbl = el('table', 'pipe-tbl'); const hr = el('tr'); hr.appendChild(el('th', null, ''));
    words.stages.forEach((s) => hr.appendChild(el('th', null, s))); tbl.appendChild(hr);
    Object.keys(m.byAudience).sort().forEach((a) => {
      const tr = el('tr'); tr.appendChild(el('th', null, a));
      words.stages.forEach((s) => tr.appendChild(el('td', null, m.byAudience[a][s] || '')));
      tbl.appendChild(tr);
    });
    if (Object.keys(m.byAudience).length) head.appendChild(tbl); else head.appendChild(el('p', 'empty', 'No conversation yet — every enquiry starts here as a «' + words.stages[0] + '».'));
    if (m.undated.length) head.appendChild(el('p', 'meta', m.undated.length + ' open conversation' + (m.undated.length === 1 ? ' has' : 's have') + ' no next-step date: ' + m.undated.map(label).join(', ')));
    if (m.unknownStage.length) head.appendChild(el('p', 'meta', m.unknownStage.length + ' row(s) carry a stage this page does not know (' + m.unknownStage.map((r) => r.stage).join(', ') + ') — the page is older than the table.'));
    box.appendChild(head);
    if (m.due.length) {
      const due = el('div', 'card'); due.appendChild(el('h2', null, 'Due on or before ' + m.today));
      m.due.forEach((r) => due.appendChild(item(r, m.today))); box.appendChild(due);
    }
    const board = el('div', 'pipe-board');
    words.stages.forEach((s) => {
      const col = el('section', 'pipe-col'); col.appendChild(el('h3', null, s + ' (' + m.columns[s].length + ')'));
      m.columns[s].forEach((r) => col.appendChild(item(r, m.today)));
      board.appendChild(col);
    });
    box.appendChild(board);
  }
  const label = (r) => r.name + (r.organization ? ' (' + r.organization + ')' : '');
  function item(r, today) {
    const c = el('div', 'pipe-item' + (r.next_step_on && r.next_step_on <= today && !words.closedStages.includes(r.stage) ? ' due' : ''));
    c.appendChild(el('strong', null, label(r)));
    const age = ageDays(r.created_at);
    c.appendChild(el('div', 'meta', r.audience + ' · ' + r.purpose + (age != null ? ' · ' + age + ' d' : '') + ' · ' + r.status));
    const stage = /** @type {HTMLSelectElement} */ (el('select'));
    words.stages.forEach((s) => { const o = /** @type {HTMLOptionElement} */ (el('option', null, s)); o.value = s; if (s === r.stage) o.selected = true; stage.appendChild(o); });
    const step = /** @type {HTMLInputElement} */ (el('input')); step.value = r.next_step || ''; step.maxLength = words.nextStepMax;
    const on = /** @type {HTMLInputElement} */ (el('input')); on.type = 'date'; on.value = r.next_step_on || '';
    /* each field named by a visible label around it (the console is English only, like admin.html) */
    const lab = (text, input) => { const l = el('label', 'f', text); l.appendChild(input); return l; };
    const save = el('button', 'btn sm', 'Save'); /** @type {HTMLButtonElement} */ (save).type = 'button';
    save.setAttribute('data-effect', 'private');   /* an admin's own record of the conversation — nothing leaves IntMap */
    save.addEventListener('click', async () => {
      const patch = { next_step: step.value.trim() || null, next_step_on: on.value || null };
      if (stage.value !== r.stage) { patch.stage = stage.value; patch.stage_changed_at = new Date().toISOString(); }
      const u = await ctx.sb.from('org_inquiries').update(patch).eq('id', r.id);
      if (u.error) ctx.toast('Update failed: ' + u.error.message); else { ctx.toast('Saved'); reload(); }
    });
    const open = el('button', 'btn sec sm', 'Open'); /** @type {HTMLButtonElement} */ (open).type = 'button';
    open.addEventListener('click', () => ctx.openEnquiry(r));
    const acts = el('div', 'row'); acts.append(save, open);
    const f = el('div', 'pipe-form'); f.append(lab('Stage', stage), lab('Next step', step), lab('Due', on), acts); c.appendChild(f);
    if (r.stage_changed_at) c.appendChild(el('div', 'meta', 'stage since ' + localDay(r.stage_changed_at)));
    return c;
  }
  reload();
  return { reload };
}
