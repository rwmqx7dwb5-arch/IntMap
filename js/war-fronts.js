/* ============================================================================
 *  IntMap · THE TWO WORLD WARS — the Layers rows   (#R349, split in two at #R409)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」「WW1とWW2でレイヤーを分けろ。」 Two rows, both OFF
 *  by default, each binding itself to the record for its own war while it is on.
 *
 *  ══ WHAT IS HERE, AND WHY THE REST IS NOT ═══════════════════════════════════════════════════
 *  Everything that RUNS AT BOOT: the two rows in the Layers panel, their labels in nine languages,
 *  and the IntMapOS commands so Atlas can reach both (CONSTITUTION — every feature is reachable from
 *  the control plane, and a command that only exists after the layer is on is not reachable).
 *  The layers themselves — the fill, the front lines, the operations, the legend with its day slider
 *  and its transport, and the cut — are js/war-layer.js, fetched through js/lazy-modules.js the first
 *  time somebody asks.
 *
 *  ⚠ THE SPLIT IS MEASURED, NOT STYLISTIC. Eager and whole, js/war-layer.js + js/war-geom.js cost
 *  tens of kB on EVERY session, for layers that are off by default — which is exactly the event
 *  scripts/perf-budget.mjs exists to notice. #R311 deferred six subsystems on this rule and #R322
 *  split js/analysis-panels.js on it: keep what registers something at boot, defer the body.
 *  What could NOT be deferred is this file: a row that appears only after you have found the layer
 *  you cannot see is not a row.
 *
 *  ⚠ AND THE FACADE ANSWERS BEFORE THE BODY ARRIVES. `isOn()` is false and `date()` is null for a
 *  war nobody has asked for — which is the truth, and is what lets a caller ask without paying for
 *  the download.
 *
 *  ⚠ (#R409) THE LABEL SPAN CARRIES `ec-lbl`. js/layer-favs.js reads a row's name from
 *  `span[data-i18n]` or `span.ec-lbl` and falls back to the RAW ID — so the old single row put a
 *  favourite on screen labelled 「wars」 in every language. One class fixes it for both rows.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.warFronts = function (HOST) {
  const L = window.IntMapLang.pick(() => HOST.lang);

  /* the two rows, and the only place their order, ids and swatches are written */
  const ROWS = [
    { id: 'ww1', sw: 'linear-gradient(90deg,#4a7fbd 50%,#b4544a 50%)',
      label: () => L('World War I (day by day)', '第一次世界大戦（日ごと）', 'Erster Weltkrieg (Tag für Tag)', 'Первая мировая война (по дням)', 'Primera Guerra Mundial (día a día)') },
    { id: 'ww2', sw: 'linear-gradient(90deg,#4a7fbd 46%,#c97f6e 46%,#c97f6e 58%,#b4544a 58%)',
      label: () => L('World War II (day by day)', '第二次世界大戦（日ごと）', 'Zweiter Weltkrieg (Tag für Tag)', 'Вторая мировая война (по дням)', 'Segunda Guerra Mundial (día a día)') },
  ];

  let body = null, pending = null;
  /* the body, fetched once for both wars. `IntMapLazy.need` is the loader's own promise, so two
     clicks in the same second cannot mount it twice. */
  function need() {
    if (body) return Promise.resolve(body);
    if (!pending) {
      pending = window.IntMapLazy.need('warLayer')
        .then(() => { body = window.__imWarFronts || null; return body; })
        .catch(() => { pending = null; return null; });
    }
    return pending;
  }

  async function toggle(id, want) {
    /* switching OFF something that was never fetched is already true — do not download a layer in
       order to turn it off */
    if (!want && !body) return false;
    const b = await need();
    if (!b) {
      try {
        HOST.imToast(L('Could not load the war data', '大戦データを読み込めませんでした', 'Kriegsdaten konnten nicht geladen werden',
          'Не удалось загрузить данные о войнах', 'No se pudieron cargar los datos de la guerra'));
      } catch (_) { }
      const el = document.getElementById('dl-' + id);
      if (el) { el.checked = false; el.closest('.lyr-row').classList.remove('on'); }
      return false;
    }
    return b.toggle(id, want);
  }

  /* ── the rows ───────────────────────────────────────────────────────────────────────────────── */
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

  /* ⚠ ATLAS DRIVES THEM LIKE EVERYTHING ELSE. `<war>.show` also SETS THE DAY, because a layer that
     can only be switched on is useless to a planner that was asked about a date. The switch goes
     through the checkbox rather than through `toggle` so the row's own state cannot disagree with
     the map's; the day goes through the layer's OWN clock, never through Chronos (#R409). */
  function osToggle(id, ctx) {
    const want = !(ctx && ctx.params && ctx.params.on === false);
    const el = document.getElementById('dl-' + id);
    if (el) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); } else toggle(id, want);
    return want;
  }
  function osShow(id, ctx) {
    osToggle(id, { params: { on: true } });
    const d = ctx && ctx.params && ctx.params.date;
    if (d) need().then((b) => { try { b && b.setDate(id, String(d).slice(0, 10)); } catch (_) { } });
  }
  try {
    for (const R of ROWS) {
      window.IntMapOS.register(R.id + '.toggle', (ctx) => osToggle(R.id, ctx), { label: 'World war ' + (R.id === 'ww1' ? 'I' : 'II') + ' · show / hide', group: 'layers' });
      window.IntMapOS.register(R.id + '.show', (ctx) => osShow(R.id, ctx), { label: 'World war ' + (R.id === 'ww1' ? 'I' : 'II') + ' · show a date', group: 'layers' });
    }
    /* ⚠ THE OLD NAMES STILL ANSWER. `wars.toggle` / `wars.show` were the only way in before the
       split, and a saved plan or an older Atlas turn may still say them. `wars.show` picks the war
       the date falls in; `wars.toggle` moves both rows together. Nothing is removed (CONSTITUTION). */
    window.IntMapOS.register('wars.toggle', (ctx) => { for (const R of ROWS) osToggle(R.id, ctx); }, { label: 'World wars · show / hide both', group: 'layers' });
    window.IntMapOS.register('wars.show', (ctx) => {
      const d = ctx && ctx.params && ctx.params.date;
      const iso = d ? String(d).slice(0, 10) : '';
      need().then((b) => {
        const w = (b && b.wars().find((x) => iso >= x.span[0] && iso <= x.span[1])) || null;
        const id = w ? w.id : (iso && iso < '1930' ? 'ww1' : 'ww2');
        osShow(id, ctx);
      });
    }, { label: 'World wars · show a date in whichever war it falls in', group: 'layers' });
  } catch (_) { }

  window.IntMapWarFronts = {
    rows: () => ROWS.map((R) => R.id),
    toggle,
    ready: need,
    isOn: (id) => !!(body && body.isOn(id)),
    date: (id) => (body ? body.date(id) : null),
    setDate: (id, d) => (body ? body.setDate(id, d) : null),
    isPlaying: (id) => !!(body && body.isPlaying(id)),
    wars: () => (body ? body.wars() : []),
    kinds: () => (body ? body.kinds() : {}),
    _build: (id, d) => (body ? body._build(id, d) : null),
  };
  return window.IntMapWarFronts;
};
