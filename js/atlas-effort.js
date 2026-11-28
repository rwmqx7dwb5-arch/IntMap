/* ============================================================================
 *  IntMap · Atlas — HOW HARD ATLAS THINKS, AS THE READER'S CHOICE
 * ----------------------------------------------------------------------------
 *  「推論強度を ChatGPT のように選べるように。料金体系は後付けでいい。」
 *
 *  One setting, five values: auto · low · medium · high · xhigh.
 *
 *    auto    what Atlas has always done — the server's default tier for the task, raised to high
 *            when the request looks compound (`cplx`, computed by js/atlas-console.js). Nothing is
 *            sent for it that was not sent before.
 *    others  the reader's pick, sent as `effortHint`. The server (supabase/functions/ai-proxy/ask.ts)
 *            applies it to the tasks that opt in (`effortHint: true`) and ignores it elsewhere.
 *
 *  This module owns the stored value, the menu and the label; it decides nothing about a request.
 *  The value is a per-reader convenience, so it lives in localStorage and a failed read means auto.
 *  Entitlements are deliberately not here: the menu offers every value to everyone until a plan
 *  exists to gate it, and a gate then belongs in `pick`, the single place a value leaves.
 * ==========================================================================*/

/** @returns {{pick:(cplx:boolean)=>(string|undefined), decide:(d:object)=>Promise<string|undefined>, mount:(panel:HTMLElement)=>void, get:()=>string}} */
export function effortExperiment(mode) {
  if (mode === 'auto') return { useProductionAuto: true };
  if (mode === 'low-adaptive') return { base: 'low', next: (requested) => requested || 'low' };
  if (mode === 'high-fixed') return { base: 'high', next: () => 'high' };
  return null;
}

export function makeAtlasEffort(H) {
  const KEY = 'intmap.atlas.effort';
  const MODES = ['auto', 'low', 'medium', 'high', 'xhigh'];
  /* the words are written where they are spoken: L() calls, not a table of pairs (scripts/i18n-pair-audit.mjs counts a pair held as data) */
  const nm = (m) => ({
    auto: H.L('Auto', '自動'), low: H.L('Fast', '高速'), medium: H.L('Standard', '標準'),
    high: H.L('Deep', '深く考える'), xhigh: H.L('Maximum', '最大'),
  })[m];
  const note = (m) => ({
    auto: H.L('Atlas sizes each request', '質問ごとにAtlasが決めます'),
    low: H.L('Quickest answers', '最も速く答えます'),
    medium: H.L('Balanced speed and depth', '速さと深さのバランス'),
    high: H.L('Thinks longer on hard questions', '難しい質問をじっくり考えます'),
    xhigh: H.L('Longest thinking, slowest', '最も長く考えます（最も遅い）'),
  })[m];
  let cur = 'auto';
  try { const v = localStorage.getItem(KEY); if (MODES.includes(v)) cur = v; } catch (_) { /* private window: auto */ }

  /* what an automatic pick falls back to when the sizing call fails: the client's own complexity guess (js/atlas-console.js) */
  function pick(cplx, mode = cur) { return mode === 'auto' ? (cplx ? 'high' : undefined) : mode; }

  /* AUTO IS A MODEL'S DECISION. The reader's own pick is used as it is; on auto, one small low-effort call reads the request and
     names a tier. Only a failure of that call (an error, a timeout, an answer that is not a tier) falls back — to `fallback`. */
  const TIERS = ['low', 'medium', 'high', 'xhigh'], NL = String.fromCharCode(10);
  async function decide(d) {
    const mode = d.mode || cur;
    if (mode !== 'auto') return mode;
    if (typeof d.ask !== 'function' || !String(d.request || '').trim()) return d.fallback;
    let timer = null, ctl = null;
    try { ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (_) { ctl = null; }
    /* observation: one low-effort JSON call returning a single word; this bounds WAITING for it. Expires with: a measured p95 of atlas_effort. */
    if (ctl) timer = setTimeout(() => { try { ctl.abort(); } catch (_) { /* settled */ } }, d.timeoutMs > 0 ? d.timeoutMs : 8000);
    if (ctl && d.signal && typeof d.signal.addEventListener === 'function') { try { d.signal.addEventListener('abort', () => { try { ctl.abort(); } catch (_) { /* settled */ } }); } catch (_) { /* no signal */ } }
    try {
      const prompt = "REQUEST (the reader's own words):" + NL + String(d.request).slice(0, 1500)
        + NL + NL + 'WHAT RIDES WITH IT: ' + (d.attachments ? d.attachments + ' attachment(s)' : 'no attachments')
        + (d.history ? NL + NL + 'EARLIER IN THIS CONVERSATION:' + NL + String(d.history).slice(-800) : '');
      const env = await d.ask(prompt, d.system || '', null, { task: 'atlas_effort', webMode: 'off', turnId: d.turnId || undefined, signal: ctl ? ctl.signal : (d.signal || undefined) });
      d.onUsage?.(env?.meta);
      const t = String(env && env.data && env.data.effort || '').toLowerCase();
      return TIERS.includes(t) ? t : d.fallback;
    } catch (_) { return d.fallback; } finally { if (timer) clearTimeout(timer); }
  }

  /* WHERE THE CHOICE LIVES. It first stood in the panel's header (.atl-btns) — which the sidebar tab and the floating card both hide
     (js/atlas-styles.js, js/atlas-float.js), so the reader never had a way to reach it. It sits in the input row now, the one strip every
     arrangement of the panel shows, beside the mic and send. The menu is drawn on <body>, positioned from the button: the input row is
     glass (backdrop-filter makes it the containing block of a fixed child) and the floating panel clips its overflow, so a menu left
     inside either would be cut off or misplaced. */
  function mount(panel) {
    const row = panel.querySelector('.atl-inbar');
    if (!row || row.querySelector('.atl-eff')) return;
    if (!document.getElementById('atl-eff-css')) {
      const s = document.createElement('style'); s.id = 'atl-eff-css';
      s.textContent = '.atl-eff{position:relative;flex:0 0 auto;display:inline-flex;}'
        + '.atl-eff-b{background:var(--input-bg);border:none;color:var(--text-muted);font-size:12px;line-height:1;cursor:pointer;padding:7px 11px;border-radius:999px;white-space:nowrap;transition:color .15s ease,background-color .15s ease;}'
        + '.atl-eff-b:hover,.atl-eff-b[aria-expanded="true"]{color:var(--text-main);}'
        + '.atl-eff-m{position:fixed;z-index:calc(var(--z-toast,5000) + 10);min-width:240px;max-width:calc(100vw - 24px);padding:6px;border-radius:16px;'
        + 'background:color-mix(in srgb,var(--popup-bg,var(--input-bg)) 62%,transparent);backdrop-filter:saturate(170%) blur(22px);-webkit-backdrop-filter:saturate(170%) blur(22px);'
        + 'border:1px solid color-mix(in srgb,var(--text-main) 14%,transparent);box-shadow:0 12px 34px rgba(0,0,0,.28);}'
        + '.atl-eff-m[hidden]{display:none;}'
        + '.atl-eff-i{display:block;width:100%;text-align:left;background:none;border:none;color:var(--text-main);cursor:pointer;padding:8px 10px;border-radius:11px;font-size:13px;text-shadow:none;}'
        + '.atl-eff-i:hover,.atl-eff-i[aria-checked="true"]{background:color-mix(in srgb,var(--text-main) 10%,transparent);}'
        + '.atl-eff-i small{display:block;color:var(--text-muted);font-size:11px;margin-top:2px;}';
      document.head.appendChild(s);
    }
    const wrap = document.createElement('span'); wrap.className = 'atl-eff';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'atl-eff-b';
    b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div'); menu.className = 'atl-eff-m'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    const label = () => { b.textContent = nm(cur); b.title = H.L('How hard Atlas thinks', 'Atlasの考える強さ'); b.setAttribute('aria-label', b.title + ': ' + nm(cur)); };
    const close = () => { menu.hidden = true; b.setAttribute('aria-expanded', 'false'); };
    function place() {
      const r = b.getBoundingClientRect(), vw = window.innerWidth, w = Math.min(menu.offsetWidth || 240, vw - 24);
      menu.style.left = Math.max(12, Math.min(vw - w - 12, r.right - w)) + 'px';
      /* above the button when there is room (the row is at the bottom of the screen), below it otherwise */
      const h = menu.offsetHeight || 260;
      if (r.top > h + 16) { menu.style.top = ''; menu.style.bottom = (window.innerHeight - r.top + 8) + 'px'; }
      else { menu.style.bottom = ''; menu.style.top = (r.bottom + 8) + 'px'; }
    }
    function render() {
      menu.textContent = '';
      MODES.forEach((m) => {
        const i = document.createElement('button'); i.type = 'button'; i.className = 'atl-eff-i';
        i.setAttribute('role', 'menuitemradio'); i.setAttribute('aria-checked', String(m === cur));
        i.textContent = nm(m);
        const n = document.createElement('small'); n.textContent = note(m); i.appendChild(n);
        i.addEventListener('click', () => { cur = m; try { localStorage.setItem(KEY, m); } catch (_) { /* per-reader convenience */ } label(); close(); });
        menu.appendChild(i);
      });
    }
    b.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) { render(); menu.hidden = false; b.setAttribute('aria-expanded', 'true'); place(); } else close(); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
    window.addEventListener('resize', close);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    label(); wrap.appendChild(b); document.body.appendChild(menu);
    const mic = row.querySelector('.atl-mic');
    row.insertBefore(wrap, mic || row.querySelector('.atl-go') || null);
  }

  return { pick, decide, mount, get: () => cur };
}

/** the task rules the sizing call's system prompt adds beside the persona (the persona itself is js/atlas-persona.js's) */
export const EFFORT_RULES = 'You are given a REQUEST and decide how much thinking the model that answers it should spend. '
  + 'Return STRICT JSON ONLY: {"effort":"low"|"medium"|"high"|"xhigh"}. '
  + 'low: a single fact, a simple lookup or a plain map action. '
  + 'medium: an ordinary question, an explanation, a news or topic digest, one or two sources. '
  + 'high: a multi-step task, a comparison or analysis across several datasets, planning, careful reading of documents or images, or an answer where a mistake is costly. '
  + 'xhigh: only for hard research, mathematics or long analysis the reader plainly wants done thoroughly. '
  + 'Speed is part of quality: choose the lowest tier that will still produce a complete, correct answer, and medium when unsure.';
