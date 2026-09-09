/* ============================================================================
 *  IntMap · INTERNET HEALTH — the Layers rows   (#R565)
 * ----------------------------------------------------------------------------
 *  「Internet Health → Internet outages → BGP anomalies → Routing visibility →
 *    Network reachability みたいなレイヤーを作れます。」
 *
 *  ══ WHAT IS HERE, AND WHY THE REST IS NOT ═══════════════════════════════════
 *  Everything that RUNS AT BOOT: the two rows in the Layers panel, their names in
 *  nine languages, and the IntMapOS commands, so Atlas can reach both from the
 *  control plane (CONSTITUTION — a command that only exists after the layer is on
 *  is not reachable). The measuring itself — the provider registry, the
 *  normalisation, the scope→geometry resolution and the painting — is
 *  js/net-health-live.js, fetched through js/lazy-modules.js the first time
 *  somebody asks. The split is the same one #R349 measured for the wars: keep
 *  what registers something at boot, defer the body.
 *
 *  ⚠ THE FACADE ANSWERS BEFORE THE BODY ARRIVES — `isOn()` is false and
 *  `state()` is empty for a layer nobody has asked for, which is the truth and is
 *  what lets a caller ask without paying for the download.
 *
 *  ⚠ THE ROW NAME LIVES HERE AND NOWHERE ELSE. js/net-health-live.js reads it
 *  back through `label(id)` for the legend heading it opens, for the reason
 *  #R519 gives: two lists of names that can disagree, disagree.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.netHealth = function (HOST) {
  const L = window.IntMapLang.pick(() => HOST.lang);

  /* The rows, and the only place their ids, swatches, names and IntMapOS labels are written.
     ⚠ `os` IS A FIELD, NOT A TERNARY, for the reason js/war-fronts.js records: a two-branch
     expression over an id stops being right the moment there is a third row, and nothing fails. */
  const ROWS = [
    { id: 'nethlth', sw: 'linear-gradient(90deg,#e8b93c 0%,#d9663f 55%,#a8332c 100%)',
      os: 'Internet outages',
      label: () => L('Internet outages', 'インターネット障害', 'Internetausfälle', 'Сбои интернета', 'Cortes de internet') },
    { id: 'netreach', sw: 'radial-gradient(circle at 50% 50%,#c8483f 0 42%,rgba(200,72,63,0.22) 42% 100%)',
      os: 'Network reachability',
      label: () => L('Network reachability (measurement probes)', 'ネットワーク到達性（測定プローブ）', 'Netzerreichbarkeit (Messsonden)', 'Достижимость сети (измерительные зонды)', 'Alcanzabilidad de red (sondas de medición)') },
  ];

  let body = null, pending = null;
  /* one download for both rows — `IntMapLazy.need` is the loader's own promise, so two clicks in
     the same second cannot mount it twice */
  function need() {
    if (body) return Promise.resolve(body);
    if (!pending) {
      pending = window.IntMapLazy.need('netHealthLive')
        .then(() => { body = window.__imNetHealth || null; return body; })
        .catch(() => { pending = null; return null; });
    }
    return pending;
  }

  async function toggle(id, want) {
    /* switching OFF something never fetched is already true — do not download a layer to close it */
    if (!want && !body) return false;
    const b = await need();
    if (!b) {
      try {
        HOST.imToast(L('Could not load the internet-health data', 'インターネット障害データを読み込めませんでした',
          'Internet-Zustandsdaten konnten nicht geladen werden', 'Не удалось загрузить данные о состоянии интернета',
          'No se pudieron cargar los datos de estado de internet'));
      } catch (_) { }
      const el = document.getElementById('dl-' + id);
      if (el) { el.checked = false; const r = el.closest('.lyr-row'); if (r) r.classList.remove('on'); }
      return false;
    }
    return b.toggle(id, want);
  }

  /* ── the rows ─────────────────────────────────────────────────────────────────────────────── */
  function buildRows() {
    const dd = document.getElementById('layer-dropdown'); if (!dd) return;
    for (const R of ROWS) {
      if (document.getElementById('dl-' + R.id)) continue;
      const w = document.createElement('div'); w.className = 'lyr-row'; w.id = 'lyrrow-' + R.id;
      w.innerHTML = '<label class="layer-option"><input type="checkbox" id="dl-' + R.id + '"> '
        + '<span class="lyr-sw" style="background:' + R.sw + '"></span> '
        + '<span class="ec-lbl" id="dl-' + R.id + '-lbl"></span></label>';
      dd.appendChild(w);
      w.querySelector('input').addEventListener('change', (ev) => {
        ev.target.closest('.lyr-row').classList.toggle('on', ev.target.checked);
        toggle(R.id, ev.target.checked);
      });
    }
    relabel();
    try { window.reorganizeLayerPanel && window.reorganizeLayerPanel(); } catch (_) { }
  }
  function relabel() { for (const R of ROWS) { const e = document.getElementById('dl-' + R.id + '-lbl'); if (e) e.textContent = R.label(); } }
  if (document.readyState !== 'loading') setTimeout(buildRows, 0); else document.addEventListener('DOMContentLoaded', buildRows);
  window.addEventListener('intmap-lang', () => setTimeout(relabel, 20));

  /* ⚠ ATLAS DRIVES THEM THROUGH THE CHECKBOX, not through `toggle`, so the row's own state cannot
     disagree with the map's (the rule js/war-fronts.js states for the same reason). */
  function osToggle(id, ctx) {
    const want = !(ctx && ctx.params && ctx.params.on === false);
    const el = document.getElementById('dl-' + id);
    if (el) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); } else toggle(id, want);
    return want;
  }
  try {
    for (const R of ROWS) {
      window.IntMapOS.register(R.id + '.toggle', (ctx) => osToggle(R.id, ctx), { label: R.os + ' · show / hide', group: 'layers' });
    }
    /* ⚠ THE READING IS A COMMAND OF ITS OWN, because switching a layer on is not an answer. This
       one returns the observations for a place — which is what 「イランで大規模遮断が始まったら」
       actually asks — and it works whether or not the row is on. */
    window.IntMapOS.register('nethlth.report', (ctx) => need().then((b) => (b ? b.report((ctx && ctx.params) || {}) : null)),
      { label: 'Internet health · what is measured for a place', group: 'data' });
    window.IntMapOS.register('nethlth.signals', () => need().then((b) => (b ? b.signals() : [])),
      { label: 'Internet health · which measurement signals the source is publishing', group: 'data' });
  } catch (_) { }

  window.IntMapNetHealth = {
    rows: () => ROWS.map((R) => R.id),
    label: (id) => { const R = ROWS.find((x) => x.id === id); return R ? R.label() : ''; },
    toggle,
    ready: need,
    isOn: (id) => !!(body && body.isOn(id)),
    /* ⚠ EMPTY IS THE HONEST ANSWER FOR A LAYER NOBODY ASKED FOR — not a download. */
    state: () => (body ? body.state() : { loaded: false, rows: {}, providers: [] }),
    signals: () => (body ? body.signals() : []),
    providers: () => (body ? body.providers() : []),
    report: (p) => need().then((b) => (b ? b.report(p || {}) : null)),
  };
  return window.IntMapNetHealth;
};
